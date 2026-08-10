import {
  createRenderSpec,
  type ClipSpec,
  type EditJob,
  type EditJobStatus,
  type EditSpec,
  type FitMode,
  type OutputProfile,
  type RenderSpec,
  type StylePreset,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { enqueueEditJob } from '../queue/edit-queue.js';

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

  // 플랜별 편집 횟수 제한은 기획 확정 시까지 미적용 — docs/plan-limits.md 참고

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
  const outputVideo = await prisma.video.create({
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

  // 3) edit_jobs 레코드 생성
  const job = await prisma.editJob.create({
    data: {
      videoId: outputVideo.id,
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

  // 4) 큐 적재. 실패 시 job/video를 failed 처리하고 에러 전파.
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
