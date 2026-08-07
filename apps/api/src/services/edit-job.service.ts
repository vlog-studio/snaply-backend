import type { EditJob, EditJobStatus, Plan, StylePreset } from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { enqueueEditJob } from '../queue/edit-queue.js';

const FREE_MONTHLY_LIMIT = 3;

interface EditJobRow {
  id: string;
  videoId: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

const SELECT = {
  id: true,
  videoId: true,
  status: true,
  progress: true,
  errorMessage: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} as const;

function toDto(row: EditJobRow): EditJob {
  return {
    id: row.id,
    videoId: row.videoId,
    status: row.status as EditJobStatus,
    progress: row.progress,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function createEditJob(params: {
  userId: string;
  plan: Plan;
  videoIds: string[];
  stylePreset: StylePreset;
}): Promise<{ jobId: string }> {
  const prisma = getPrisma();

  // 1) 소유권 + 준비 상태 검증
  const sources = await prisma.video.findMany({
    where: {
      id: { in: params.videoIds },
      userId: params.userId,
      deletedAt: null,
      kind: 'source',
      status: 'ready',
    },
    select: { id: true, originalUrls: true },
  });
  if (sources.length !== params.videoIds.length) {
    throw AppError.forbidden('편집할 수 없는 영상이 포함되어 있습니다. (소유권 또는 상태 확인)');
  }

  // 2) Free 플랜 월 3편 제한
  if (params.plan === 'free') {
    const usedThisMonth = await prisma.editJob.count({
      where: { userId: params.userId, createdAt: { gte: startOfMonth() } },
    });
    if (usedThisMonth >= FREE_MONTHLY_LIMIT) {
      throw AppError.forbidden(
        `무료 플랜은 월 ${FREE_MONTHLY_LIMIT}편까지 편집할 수 있습니다. 플랜을 업그레이드하세요.`,
      );
    }
  }

  // 3) 결과물 video 레코드 생성 (원본 클립 URL 취합)
  const originalUrls = sources.flatMap((s) => s.originalUrls);
  const outputVideo = await prisma.video.create({
    data: {
      userId: params.userId,
      kind: 'result',
      status: 'processing',
      stylePreset: params.stylePreset,
      originalUrls,
    },
    select: { id: true },
  });

  // 4) edit_jobs 레코드 생성
  const job = await prisma.editJob.create({
    data: {
      videoId: outputVideo.id,
      userId: params.userId,
      status: 'queued',
      progress: 0,
    },
    select: { id: true },
  });

  // 5) 큐 적재. 실패 시 job/video를 failed 처리하고 에러 전파.
  try {
    await enqueueEditJob({
      jobId: job.id,
      userId: params.userId,
      videoIds: params.videoIds,
      stylePreset: params.stylePreset,
    });
  } catch (err) {
    await prisma.editJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: '큐 적재에 실패했습니다.' },
    });
    await prisma.video.update({ where: { id: outputVideo.id }, data: { status: 'failed' } });
    throw err;
  }

  return { jobId: job.id };
}

export async function getEditJob(params: { userId: string; jobId: string }): Promise<EditJob> {
  const row = await getPrisma().editJob.findFirst({
    where: { id: params.jobId, userId: params.userId },
    select: SELECT,
  });
  if (!row) {
    throw AppError.notFound('편집 작업을 찾을 수 없습니다.');
  }
  return toDto(row);
}

/** WebSocket 연결 시 소유권 확인 + 현재 상태 반환 (없으면 null) */
export async function getEditJobForOwner(params: {
  userId: string;
  jobId: string;
}): Promise<EditJob | null> {
  const row = await getPrisma().editJob.findFirst({
    where: { id: params.jobId, userId: params.userId },
    select: SELECT,
  });
  return row ? toDto(row) : null;
}
