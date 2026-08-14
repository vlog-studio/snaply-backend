import {
  createRenderSpec,
  type ClipSpec,
  type EditJob,
  type EditJobErrorCode,
  type EditJobStatus,
  type EditProgressEvent,
  type EditSpec,
  type FitMode,
  type OutputProfile,
  type RenderSpec,
  type StylePreset,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { editProgressChannel, getRedisPublisher } from '../lib/redis.js';
import { enqueueEditJob, removeEditJob } from '../queue/edit-queue.js';
import {
  assertCreditsForExport,
  recordExportReserve,
  refundForExport,
} from './credit.service.js';
import { createDownloadUrl } from './storage.service.js';

const MAX_CLIPS = 10;
const MIN_CLIP_DURATION_MS = 100;

interface EditJobRow {
  id: string;
  videoId: string;
  pipelineVersion: string;
  editSpec: unknown;
  renderSpec: unknown;
  status: string;
  progress: number;
  errorMessage: string | null;
  errorCode: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

const SELECT = {
  id: true,
  videoId: true,
  pipelineVersion: true,
  editSpec: true,
  renderSpec: true,
  status: true,
  progress: true,
  errorMessage: true,
  errorCode: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} as const;

const LEGACY_RENDER_SPEC = createRenderSpec('youtube_landscape', 'contain');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEditSpec(value: unknown): EditSpec {
  if (
    isRecord(value) &&
    value.version === 2 &&
    ['감성', '여행', '일상'].includes(String(value.stylePreset)) &&
    Array.isArray(value.clips)
  ) {
    const clips = value.clips.map(parseClipSpec);
    if (clips.length >= 1 && clips.length <= MAX_CLIPS && clips.every((clip) => clip !== null)) {
      return {
        version: 2,
        stylePreset: value.stylePreset as StylePreset,
        clips: clips as ClipSpec[],
      };
    }
  }
  if (
    isRecord(value) &&
    value.version === 1 &&
    ['감성', '여행', '일상'].includes(String(value.stylePreset))
  ) {
    return value as unknown as EditSpec;
  }
  return { version: 1, stylePreset: '일상' };
}

function parseClipSpec(value: unknown): ClipSpec | null {
  if (!isRecord(value) || typeof value.videoId !== 'string') {
    return null;
  }
  if (!Number.isInteger(value.startMs) || Number(value.startMs) < 0) {
    return null;
  }
  if (value.endMs !== undefined) {
    if (
      !Number.isInteger(value.endMs) ||
      Number(value.endMs) - Number(value.startMs) < MIN_CLIP_DURATION_MS
    ) {
      return null;
    }
    return {
      videoId: value.videoId,
      startMs: Number(value.startMs),
      endMs: Number(value.endMs),
    };
  }
  return { videoId: value.videoId, startMs: Number(value.startMs) };
}

function validateClips(clips: ClipSpec[]): void {
  if (clips.length < 1 || clips.length > MAX_CLIPS) {
    throw AppError.badRequest(`클립은 1개 이상 ${MAX_CLIPS}개 이하로 요청해야 합니다.`);
  }
  for (const clip of clips) {
    if (!clip.videoId) {
      throw AppError.badRequest('클립 videoId가 필요합니다.');
    }
    if (!Number.isInteger(clip.startMs) || clip.startMs < 0) {
      throw AppError.badRequest('클립 시작 시간은 0 이상의 정수 밀리초여야 합니다.');
    }
    if (clip.endMs !== undefined) {
      if (!Number.isInteger(clip.endMs) || clip.endMs <= clip.startMs) {
        throw AppError.badRequest('클립 종료 시간은 시작 시간보다 커야 합니다.');
      }
      if (clip.endMs - clip.startMs < MIN_CLIP_DURATION_MS) {
        throw AppError.badRequest(`클립 길이는 최소 ${MIN_CLIP_DURATION_MS}ms여야 합니다.`);
      }
    }
  }
}

function parseRenderSpec(value: unknown): RenderSpec {
  if (
    isRecord(value) &&
    value.profileVersion === 1 &&
    ['short_vertical', 'youtube_landscape', 'instagram_portrait', 'square'].includes(
      String(value.outputProfile),
    ) &&
    ['contain', 'cover', 'blur_background'].includes(String(value.fitMode)) &&
    Number.isInteger(value.width) &&
    Number(value.width) > 0 &&
    Number.isInteger(value.height) &&
    Number(value.height) > 0 &&
    Number.isInteger(value.fps) &&
    Number(value.fps) > 0
  ) {
    return value as unknown as RenderSpec;
  }
  return LEGACY_RENDER_SPEC;
}

function toDto(row: EditJobRow): EditJob {
  return {
    id: row.id,
    videoId: row.videoId,
    pipelineVersion: row.pipelineVersion,
    editSpec: parseEditSpec(row.editSpec),
    renderSpec: parseRenderSpec(row.renderSpec),
    status: row.status as EditJobStatus,
    progress: row.progress,
    errorMessage: row.errorMessage,
    errorCode: (row.errorCode as EditJobErrorCode | null) ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createEditJob(params: {
  userId: string;
  clips: ClipSpec[];
  stylePreset: StylePreset;
  outputProfile: OutputProfile;
  fitMode: FitMode;
  /** 소프트 자막 생성 여부 (기본 false — 쇼츠용) */
  subtitles: boolean;
}): Promise<{ jobId: string }> {
  const prisma = getPrisma();
  validateClips(params.clips);
  const clips = params.clips.map((clip) => ({
    videoId: clip.videoId,
    startMs: clip.startMs,
    ...(clip.endMs !== undefined ? { endMs: clip.endMs } : {}),
  }));
  const editSpec: EditSpec = { version: 2, stylePreset: params.stylePreset, clips };
  const renderSpec = createRenderSpec(params.outputProfile, params.fitMode);
  const uniqueVideoIds = [...new Set(clips.map((clip) => clip.videoId))];

  // 1) 소유권 + 준비 상태 검증
  const sources = await prisma.video.findMany({
    where: {
      id: { in: uniqueVideoIds },
      userId: params.userId,
      deletedAt: null,
      kind: 'source',
      status: 'ready',
    },
    select: { id: true, originalUrls: true, originalS3Keys: true, s3Key: true },
  });
  if (sources.length !== uniqueVideoIds.length) {
    throw AppError.forbidden('편집할 수 없는 영상이 포함되어 있습니다. (소유권 또는 상태 확인)');
  }

  // 2) 결과물 video 레코드 생성 (원본 클립 URL 취합)
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const originalUrls = uniqueVideoIds.flatMap((id) => sourcesById.get(id)?.originalUrls ?? []);
  const originalS3Keys = uniqueVideoIds.flatMap((id) => {
    const source = sourcesById.get(id);
    if (!source) {
      return [];
    }
    return source.originalS3Keys.length > 0
      ? source.originalS3Keys
      : source.s3Key
        ? [source.s3Key]
        : [];
  });
  // 3) 결과물 video + edit_jobs 레코드 생성과 크레딧 예약을 한 트랜잭션에 묶는다.
  //    예약만 남고 작업이 없거나 그 반대인 상태를 만들지 않기 위해서다.
  //    잔액이 모자라면 여기서 402로 끊기고 video/job 레코드도 함께 롤백된다.
  const { job, outputVideo } = await prisma.$transaction(async (tx) => {
    // 잔액 확인 겸 유저 행 잠금이 먼저다 — 아래 INSERT 들이 FK 검사로 같은 행에 share 락을
    // 걸기 때문에, 순서를 바꾸면 동시 요청끼리 데드락이 난다 (credit.service 주석 참고).
    await assertCreditsForExport(tx, { userId: params.userId });

    const video = await tx.video.create({
      data: {
        userId: params.userId,
        kind: 'result',
        status: 'processing',
        stylePreset: params.stylePreset,
        originalUrls,
        originalS3Keys,
      },
      select: { id: true },
    });

    const created = await tx.editJob.create({
      data: {
        videoId: video.id,
        userId: params.userId,
        pipelineVersion: '3',
        editSpec: {
          version: editSpec.version,
          stylePreset: editSpec.stylePreset,
          clips: clips.map((clip) => ({
            videoId: clip.videoId,
            startMs: clip.startMs,
            ...(clip.endMs !== undefined ? { endMs: clip.endMs } : {}),
          })),
        },
        renderSpec: {
          profileVersion: renderSpec.profileVersion,
          outputProfile: renderSpec.outputProfile,
          width: renderSpec.width,
          height: renderSpec.height,
          fps: renderSpec.fps,
          fitMode: renderSpec.fitMode,
        },
        status: 'queued',
        progress: 0,
      },
      select: { id: true },
    });

    await recordExportReserve(tx, { userId: params.userId, editJobId: created.id });
    return { job: created, outputVideo: video };
  });

  // 4) 큐 적재. 실패 시 job/video를 failed 처리하고 예약분을 환급한 뒤 에러 전파.
  try {
    await enqueueEditJob({
      jobId: job.id,
      userId: params.userId,
      clips,
      stylePreset: params.stylePreset,
      editSpec,
      renderSpec,
      subtitles: params.subtitles,
    });
  } catch (err) {
    await prisma.editJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: '큐 적재에 실패했습니다.', errorCode: 'QUEUE_FAILED' },
    });
    await prisma.video.update({ where: { id: outputVideo.id }, data: { status: 'failed' } });
    await refundForExport(job.id);
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

/**
 * 진행 중(queued/processing)인 편집 작업을 취소한다. 최종 상태는 `canceled`.
 *
 * - DB 상태 변경이 취소의 원천이다. 큐 제거는 최선 노력이고, 워커가 이미 잡은 작업은
 *   진행률 갱신 시점에 `canceled`를 발견하고 스스로 중단한다 (ai-worker `JobCanceled`).
 * - 결과물 video 레코드는 `failed` + 소프트 삭제한다 — 취소는 사용자에게 실패로
 *   보여줄 대상이 아니므로 목록에서 사라지는 것이 맞다.
 * - 진행률 채널에 `{status:'canceled'}`를 발행해 열려 있는 WebSocket을 종료시킨다.
 * - 이미 `canceled`면 멱등하게 성공, `done`/`failed`면 409.
 */
export async function cancelEditJob(params: { userId: string; jobId: string }): Promise<void> {
  const prisma = getPrisma();
  const now = new Date();

  const result = await prisma.editJob.updateMany({
    where: {
      id: params.jobId,
      userId: params.userId,
      status: { in: ['queued', 'processing'] },
    },
    data: { status: 'canceled', completedAt: now },
  });

  if (result.count === 0) {
    const row = await prisma.editJob.findFirst({
      where: { id: params.jobId, userId: params.userId },
      select: { status: true },
    });
    if (!row) {
      throw AppError.notFound('편집 작업을 찾을 수 없습니다.');
    }
    if (row.status === 'canceled') {
      return; // 이미 취소됨 — 멱등
    }
    throw AppError.conflict('이미 종료된 편집 작업은 취소할 수 없습니다.');
  }

  // 결과물 video 정리 — 완성물이 생기지 않으므로 목록에서 숨긴다
  const job = await prisma.editJob.findUnique({
    where: { id: params.jobId },
    select: { videoId: true },
  });
  if (job) {
    await prisma.video.updateMany({
      where: { id: job.videoId, deletedAt: null, kind: 'result' },
      data: { status: 'failed', deletedAt: now },
    });
  }

  await removeEditJob(params.jobId);

  // 결과물이 없으므로 예약분을 돌려준다. 워커가 같은 작업을 실패로 확정해 환급을
  // 시도하더라도 `(edit_job_id, reason)` unique 제약이 중복 환급을 막는다.
  await refundForExport(params.jobId);

  const event: EditProgressEvent = { progress: 0, step: '취소됨', status: 'canceled' };
  await getRedisPublisher()
    .publish(editProgressChannel(params.jobId), JSON.stringify(event))
    .catch(() => undefined); // 발행 실패해도 취소 자체는 유효 — WS는 최종 상태 조회로 수렴

  return;
}

/**
 * done 작업의 결과물 재생 URL. 워커가 실시간 완료 메시지에 넣는 `outputUrl`과 같은 대상 —
 * 완료 후 (재)연결한 WebSocket 스냅샷도 동일한 계약을 지키기 위해 사용한다.
 * 결과물이 없거나 아직 URL이 채워지지 않았으면 null.
 */
export async function getEditJobOutputUrl(videoId: string): Promise<string | null> {
  const video = await getPrisma().video.findUnique({
    where: { id: videoId },
    select: { editedUrl: true, editedS3Key: true },
  });
  if (!video) {
    return null;
  }
  return video.editedS3Key ? createDownloadUrl(video.editedS3Key) : video.editedUrl;
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
