import { randomUUID } from 'node:crypto';
import {
  TRASH_LIST_MAX,
  type CursorPaginated,
  type StylePreset,
  type TrashList,
  type Video,
  type VideoKind,
  type VideoLookup,
  type VideoStatus,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { enqueueRendition, requeueRendition } from '../queue/rendition-queue.js';
import { EXPIRY_TO_PURGE_DAYS, SNAP_RETENTION_DAYS, cutoffFor, snapExpiresAt } from './retention-policy.js';
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

/**
 * 영상 삭제. **올라간 스냅이 보관 기간 안이면 파일을 남긴다** — 최근 삭제(휴지통)에서 원래 보관 기간이 끝날 때까지
 * 되살릴 수 있다(SNAP-20, docs/decisions/snap-trash.md). 남긴 파일은 그 기간이 끝나면 정리 배치가 지운다
 * (`retention.service.ts` `findOrphanedObjects`). 그 밖의 영상 — 올라가는 중인 스냅, 보관 기간이 끝난 스냅,
 * 결과물 — 은 지금처럼 파일을 바로 지운다. 어느 쪽이든 목록 · 상세에서는 곧바로 사라지고 그 스냅을 쓰던 무비의 컷은
 * `unavailable` 로 남으며, 다른 기기는 `POST /videos/lookup` 의 `removed` 로 알아 자기 원본을 지운다(되살리면 서버
 * 사본을 받는다).
 *
 * **분석 결과는 어느 쪽이든 바로 파기한다**(ANA-3) — 개인정보처리방침이 "영상을 삭제하면 그 영상의 분석 결과도 함께
 * 삭제"한다고 고지한다. 휴지통에서 되살린 스냅은 분석이 필요해질 때 다시 분석된다(분석은 요청 시점에만 돈다, ANA-1).
 * 진행 중이던 분석은 워커가 결과를 쓸 행이 없어 버린다(`apps/ai-worker/src/analysis_db.py` `save_result`).
 *
 * 돌려주는 `restorableUntil` 은 되살릴 수 있는 마지막 시각이고, 되살릴 수 없으면 `null` 이다.
 */
export async function deleteVideo(params: {
  userId: string;
  videoId: string;
}): Promise<{ restorableUntil: string | null }> {
  const prisma = getPrisma();
  const video = await prisma.video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null },
    select: { ...VIDEO_ASSET_SELECT, status: true, createdAt: true },
  });
  if (!video) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }

  const now = new Date();
  const restorableUntil = restorableUntilOf(video, now);
  if (restorableUntil) {
    await prisma.$transaction([
      prisma.videoAnalysis.deleteMany({ where: { videoId: video.id } }),
      prisma.video.update({
        where: { id: video.id },
        data: { deletedAt: now, status: 'deleted', removalReason: 'user', keptForRestore: true },
      }),
    ]);
    return { restorableUntil: restorableUntil.toISOString() };
  }

  // 결과물이면 원본 스냅의 키는 건드리지 않는다 — 빌려 온 키다(video-assets.ts).
  for (const key of ownedObjectKeys(video)) {
    try {
      await deleteObject(key);
    } catch {
      // 스토리지 삭제 실패해도 소프트 삭제는 진행 (원본은 정리 배치로 처리)
    }
  }

  await prisma.$transaction([
    prisma.videoAnalysis.deleteMany({ where: { videoId: video.id } }),
    prisma.video.update({
      where: { id: video.id },
      // 사유를 남긴다 — 사용자가 지운 것과 기간 만료로 사라진 것은 보여줄 문구가 다르다(SNAP-12).
      data: { deletedAt: now, status: 'deleted', removalReason: 'user' },
    }),
  ]);
  return { restorableUntil: null };
}

/** 지우면 되살릴 수 있는가 — 서버에 사본이 있는 스냅(업로드가 끝났고 보관 기간 안)만. 되살릴 수 있는 마지막 시각을 준다. */
function restorableUntilOf(
  video: { kind: string; status: string; createdAt: Date },
  now: Date,
): Date | null {
  if (video.kind !== 'source' || video.status !== 'ready') return null;
  const until = snapExpiresAt(video.createdAt);
  return until > now ? until : null;
}

/** 이 시각 뒤에 만든 스냅은 아직 보관 기간 안이다 — 휴지통에 있을 수 있다. */
function restorableCutoff(now: Date): Date {
  return cutoffFor(SNAP_RETENTION_DAYS + EXPIRY_TO_PURGE_DAYS, now);
}

/**
 * 최근 삭제(휴지통) — 파일을 남기고 지운 스냅 중 보관 기간이 아직 끝나지 않은 것. 지운 순서로, 최근 것부터.
 * 보관 기간이 끝난 것은 정리 배치가 지우기 전이라도 넣지 않는다(되살릴 수 없다).
 */
export async function listTrashedVideos(params: { userId: string }): Promise<TrashList> {
  const now = new Date();
  const rows = await getPrisma().video.findMany({
    where: {
      userId: params.userId,
      kind: 'source',
      deletedAt: { not: null },
      keptForRestore: true,
      purgedAt: null,
      createdAt: { gt: restorableCutoff(now) },
    },
    orderBy: { deletedAt: 'desc' },
    take: TRASH_LIST_MAX,
    select: {
      id: true,
      clientId: true,
      capturedAt: true,
      durationMs: true,
      width: true,
      height: true,
      thumbnailS3Key: true,
      thumbnailUrl: true,
      deletedAt: true,
      createdAt: true,
    },
  });
  return {
    items: await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        clientId: row.clientId,
        capturedAt: row.capturedAt?.toISOString() ?? null,
        durationMs: row.durationMs,
        width: row.width,
        height: row.height,
        thumbnailUrl: row.thumbnailS3Key ? await createDownloadUrl(row.thumbnailS3Key) : row.thumbnailUrl,
        // 조회 조건이 deletedAt 을 요구한다.
        deletedAt: (row.deletedAt ?? now).toISOString(),
        restorableUntil: snapExpiresAt(row.createdAt).toISOString(),
      })),
    ),
  };
}

/**
 * 휴지통의 스냅을 되살린다. 목록 · 무비 후보 · 다른 기기에 다시 나타난다 — 다른 기기는 서버 목록에서 그 스냅을 다시
 * 들인다. 지울 때 무비에서 빠진 컷은 돌아오지 않는다(SNAP-20).
 *
 * 이미 살아 있는 스냅이면 그대로 돌려준다(되돌리기를 두 번 눌러도 된다). 보관 기간이 끝났거나 파일을 남기지 않고 지운
 * 스냅이면 409 `NOT_RESTORABLE`, 없거나 남의 것이면 404 다.
 *
 * 지운 동안 렌디션 작업은 건너뛰었을 수 있다(지운 영상은 만들지 않는다). 배포본이 아직 없으면 다시 적재한다.
 */
export async function restoreVideo(params: { userId: string; videoId: string }): Promise<Video> {
  const prisma = getPrisma();
  const owned = await prisma.video.findFirst({
    where: { id: params.videoId, userId: params.userId, kind: 'source' },
    select: { ...SELECT, deletedAt: true },
  });
  if (!owned) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }
  if (owned.deletedAt === null) {
    return toDto(owned);
  }

  // 확인과 쓰기 사이에 보관 기간이 끝나 정리 배치가 지웠을 수 있다 — 조건을 쓰기에 건다.
  const { count } = await prisma.video.updateMany({
    where: {
      id: owned.id,
      deletedAt: { not: null },
      keptForRestore: true,
      purgedAt: null,
      createdAt: { gt: restorableCutoff(new Date()) },
    },
    data: { deletedAt: null, status: 'ready', removalReason: null, keptForRestore: false },
  });
  if (count === 0) {
    throw new AppError(409, 'NOT_RESTORABLE', '보관 기간이 끝나 되살릴 수 없습니다.');
  }

  const restored = await prisma.video.findUniqueOrThrow({ where: { id: owned.id }, select: SELECT });
  if (restored.renditionStatus !== 'ready' && restored.s3Key) {
    try {
      await requeueRendition({ videoId: restored.id, userId: params.userId, s3Key: restored.s3Key });
    } catch (err) {
      captureException(err, { videoId: restored.id, phase: 'rendition-requeue-on-restore' });
    }
  }
  return toDto(restored);
}
