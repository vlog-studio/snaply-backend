import { randomUUID } from 'node:crypto';
import type {
  CursorPaginated,
  StylePreset,
  Video,
  VideoKind,
  VideoLookup,
  VideoStatus,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { enqueueRendition } from '../queue/rendition-queue.js';
import { snapExpiresAt } from './retention-policy.js';
import {
  createDownloadUrl,
  createUploadUrl,
  deleteObject,
  getObjectSize,
  maxUploadBytes,
  publicUrl,
} from './storage.service.js';
import { VIDEO_ASSET_SELECT, ownedObjectKeys } from './video-assets.js';

interface VideoRow {
  id: string;
  kind: string;
  originalUrls: string[];
  originalS3Keys: string[];
  editedUrl: string | null;
  editedS3Key: string | null;
  thumbnailUrl: string | null;
  thumbnailS3Key: string | null;
  s3Key: string | null;
  durationSeconds: number | null;
  stylePreset: string | null;
  status: string;
  capturedAt: Date | null;
  renditionS3Key: string | null;
  renditionStatus: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  clientId: string | null;
  createdAt: Date;
}

async function toDto(row: VideoRow): Promise<Video> {
  const originalS3Keys =
    row.originalS3Keys.length > 0
      ? row.originalS3Keys
      : row.s3Key
        ? [row.s3Key]
        : [];

  return {
    id: row.id,
    kind: row.kind as VideoKind,
    originalUrls:
      originalS3Keys.length > 0
        ? await Promise.all(originalS3Keys.map(createDownloadUrl))
        : row.originalUrls,
    editedUrl: row.editedS3Key ? await createDownloadUrl(row.editedS3Key) : row.editedUrl,
    thumbnailUrl: row.thumbnailS3Key
      ? await createDownloadUrl(row.thumbnailS3Key)
      : row.thumbnailUrl,
    durationSeconds: row.durationSeconds,
    stylePreset: row.stylePreset as StylePreset | null,
    status: row.status as VideoStatus,
    capturedAt: row.capturedAt?.toISOString() ?? null,
    // 어디서나 재생되는 배포본. 아직 없으면(생성 전·실패) null 이고, 그때 앱은 원본으로 돌아간다.
    playbackUrl: row.renditionS3Key ? await createDownloadUrl(row.renditionS3Key) : null,
    durationMs: row.durationMs,
    width: row.width,
    height: row.height,
    clientId: row.clientId,
    // 보관 기간은 업로드가 끝난 원본에만 걸린다. 결과물의 수명은 무비가 정한다(MOV-16).
    expiresAt:
      row.kind === 'source' && row.status === 'ready'
        ? snapExpiresAt(row.createdAt).toISOString()
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  kind: true,
  originalUrls: true,
  originalS3Keys: true,
  editedUrl: true,
  editedS3Key: true,
  thumbnailUrl: true,
  thumbnailS3Key: true,
  s3Key: true,
  durationSeconds: true,
  stylePreset: true,
  status: true,
  capturedAt: true,
  renditionS3Key: true,
  renditionStatus: true,
  durationMs: true,
  width: true,
  height: true,
  clientId: true,
  createdAt: true,
} as const;

export interface UploadTarget {
  videoId: string;
  uploadUrl: string;
  s3Key: string;
}

/** presigned URL 발급 + status='pending' 영상 레코드 선생성 */
export async function createUploadTarget(params: {
  userId: string;
  filename: string;
  contentType: string;
}): Promise<UploadTarget> {
  const videoId = randomUUID();
  const { uploadUrl, s3Key } = await createUploadUrl({
    userId: params.userId,
    videoId,
    filename: params.filename,
    contentType: params.contentType,
  });

  await getPrisma().video.create({
    data: {
      id: videoId,
      userId: params.userId,
      kind: 'source',
      status: 'pending',
      s3Key,
      originalUrls: [],
    },
  });

  return { videoId, uploadUrl, s3Key };
}

/** S3 업로드 완료 후 호출. 실제 업로드 여부/용량 확인 후 status='ready'. */
export async function confirmUpload(params: {
  userId: string;
  videoId: string;
  durationSeconds?: number;
  /** 클라이언트가 보고한 촬영 시각(ISO). 생략하면 저장하지 않는다 — 서버가 소급할 수 없다. */
  capturedAt?: string;
  /** 앱이 붙인 스냅 이름. 해석하지 않고 그대로 돌려준다. */
  clientId?: string;
}): Promise<Video> {
  const prisma = getPrisma();
  const video = await prisma.video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null },
    select: { id: true, s3Key: true, status: true },
  });
  if (!video || !video.s3Key) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }

  const size = await getObjectSize(video.s3Key);
  if (size === null) {
    throw AppError.badRequest('업로드된 파일을 찾을 수 없습니다. 먼저 presigned URL로 업로드하세요.');
  }
  if (size > maxUploadBytes()) {
    await deleteObject(video.s3Key);
    await prisma.video.delete({ where: { id: video.id } });
    throw AppError.badRequest('파일 크기가 최대 허용치(500MB)를 초과했습니다.');
  }

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      status: 'ready',
      originalUrls: [publicUrl(video.s3Key)],
      originalS3Keys: [video.s3Key],
      ...(params.durationSeconds !== undefined ? { durationSeconds: params.durationSeconds } : {}),
      ...(params.capturedAt !== undefined ? { capturedAt: new Date(params.capturedAt) } : {}),
      ...(params.clientId !== undefined ? { clientId: params.clientId } : {}),
    },
    select: SELECT,
  });

  // 배포 렌디션 생성을 요청한다. **실패해도 업로드는 성공이다** — 렌디션이 없으면 다른
  // 플랫폼에서 재생이 안 될 뿐 스냅은 쓸 수 있고 편집은 원본으로 돈다. 여기서 예외를 던지면
  // 이미 올라간 파일을 두고 사용자에게 실패를 보이게 된다.
  try {
    await enqueueRendition({ videoId: video.id, userId: params.userId, s3Key: video.s3Key });
  } catch (err) {
    captureException(err, { videoId: video.id, phase: 'rendition-enqueue' });
  }

  return await toDto(updated);
}

export async function listVideos(params: {
  userId: string;
  kind?: VideoKind;
  cursor?: string;
  limit: number;
}): Promise<CursorPaginated<Video>> {
  const rows = await getPrisma().video.findMany({
    where: {
      userId: params.userId,
      deletedAt: null,
      ...(params.kind ? { kind: params.kind } : {}),
    },
    // 같은 시각에 올라온 행이 있어도 페이지 경계가 흔들리지 않게 id 로 한 번 더 정렬한다 —
    // 앱의 reconcile 은 전 페이지를 읽어 "목록에 없다"를 판단의 입력으로 쓴다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: SELECT,
  });

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items: await Promise.all(items.map(toDto)),
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

export async function getVideo(params: { userId: string; videoId: string }): Promise<Video> {
  const row = await getPrisma().video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null },
    select: SELECT,
  });
  if (!row) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }
  return await toDto(row);
}

/**
 * 영상 id 들이 지금 어떤 상태인지 — 목록에서 사라진 스냅의 **이유**를 앱에 알려 준다.
 *
 * 목록과 상세는 지워진 행을 숨기므로, 앱은 "목록에 없다"만으로는 다른 기기에서 지운 것인지
 * 기간이 끝난 것인지 알 수 없다. 둘은 기기에서 하는 일이 다르다(decisions/snap-sync-across-devices.md).
 * 남의 id 와 없는 id 는 똑같이 응답에서 빠진다 — 존재 여부조차 알 수 없어야 한다(SNAP-8).
 */
export async function lookupVideos(params: { userId: string; ids: string[] }): Promise<VideoLookup> {
  const rows = await getPrisma().video.findMany({
    where: { userId: params.userId, id: { in: [...new Set(params.ids)] } },
    select: { id: true, deletedAt: true, removalReason: true },
  });
  return {
    items: rows.map((row) =>
      row.deletedAt
        ? {
            id: row.id,
            state: 'removed' as const,
            // 사유 컬럼이 생기기 전에 지워진 행은 사용자가 지운 것이다(schema.prisma VideoRemovalReason).
            removalReason: row.removalReason ?? 'user',
            removedAt: row.deletedAt.toISOString(),
          }
        : { id: row.id, state: 'live' as const, removalReason: null, removedAt: null },
    ),
  };
}

/**
 * presigned URL 발급 후 이 시간이 지나도록 확정(POST /videos)되지 않은 pending 영상은
 * 고아로 간주하고 배치가 회수한다 — decisions/snap-source-of-truth.md §5 GC ①.
 */
export const PENDING_VIDEO_TTL_HOURS = 24;

const PENDING_TTL_MS = PENDING_VIDEO_TTL_HOURS * 60 * 60 * 1000;

export interface StalePendingVideo {
  id: string;
  s3Key: string | null;
  createdAt: Date;
}

/** TTL 이 지난 미확정 pending 영상 목록. 편집 결과물(kind='result')은 대상이 아니다. */
export async function findStalePendingVideos(
  now: Date = new Date(),
): Promise<StalePendingVideo[]> {
  const cutoff = new Date(now.getTime() - PENDING_TTL_MS);
  return getPrisma().video.findMany({
    where: { kind: 'source', status: 'pending', createdAt: { lte: cutoff } },
    select: { id: true, s3Key: true, createdAt: true },
  });
}

/**
 * 고아 pending 영상 회수. 업로드만 하고 confirm 을 안 한 객체가 있을 수 있으므로
 * S3 를 먼저 지운다(없는 키 삭제는 no-op). 개별 실패는 기록하고 다음으로 넘어간다.
 */
export async function purgeStalePendingVideos(
  now: Date = new Date(),
): Promise<{ purged: string[]; failed: string[] }> {
  const prisma = getPrisma();
  const purged: string[] = [];
  const failed: string[] = [];

  for (const video of await findStalePendingVideos(now)) {
    try {
      if (video.s3Key) {
        await deleteObject(video.s3Key);
      }
      await prisma.video.delete({ where: { id: video.id } });
      purged.push(video.id);
    } catch (err) {
      captureException(err, { videoId: video.id, phase: 'pending-video-purge' });
      failed.push(video.id);
    }
  }

  return { purged, failed };
}

/** 영상이 소유한 S3 객체 삭제 + DB 소프트 삭제 */
export async function deleteVideo(params: { userId: string; videoId: string }): Promise<void> {
  const prisma = getPrisma();
  const video = await prisma.video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null },
    select: VIDEO_ASSET_SELECT,
  });
  if (!video) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }

  // 결과물이면 원본 스냅의 키는 건드리지 않는다 — 빌려 온 키다(video-assets.ts).
  for (const key of ownedObjectKeys(video)) {
    try {
      await deleteObject(key);
    } catch {
      // 스토리지 삭제 실패해도 소프트 삭제는 진행 (원본은 정리 배치로 처리)
    }
  }

  await prisma.video.update({
    where: { id: video.id },
    // 사유를 남긴다 — 사용자가 지운 것과 기간 만료로 사라진 것은 보여줄 문구가 다르다(SNAP-12).
    data: { deletedAt: new Date(), status: 'deleted', removalReason: 'user' },
  });
}
