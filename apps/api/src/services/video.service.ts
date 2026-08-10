import { randomUUID } from 'node:crypto';
import type {
  CursorPaginated,
  StylePreset,
  Video,
  VideoKind,
  VideoStatus,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import {
  createDownloadUrl,
  createUploadUrl,
  deleteObject,
  getObjectSize,
  maxUploadBytes,
  publicUrl,
} from './storage.service.js';

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
    },
    select: SELECT,
  });
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
    orderBy: { createdAt: 'desc' },
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

/** S3 원본 삭제 + DB 소프트 삭제 */
export async function deleteVideo(params: { userId: string; videoId: string }): Promise<void> {
  const prisma = getPrisma();
  const video = await prisma.video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null },
    select: { id: true, s3Key: true, editedS3Key: true, thumbnailS3Key: true },
  });
  if (!video) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }

  const ownedObjectKeys = [video.s3Key, video.editedS3Key, video.thumbnailS3Key].filter(
    (key): key is string => key !== null,
  );
  for (const key of new Set(ownedObjectKeys)) {
    try {
      await deleteObject(key);
    } catch {
      // 스토리지 삭제 실패해도 소프트 삭제는 진행 (원본은 정리 배치로 처리)
    }
  }

  await prisma.video.update({
    where: { id: video.id },
    data: { deletedAt: new Date(), status: 'deleted' },
  });
}
