/**
 * 스냅 내용 분석 — 요청 접수와 조회.
 *
 * 분석은 **업로드 시점이 아니라 요청 시점에** 돈다. 스냅은 대량으로 올라오고 실제로 편집에
 * 쓰이는 것은 일부라, 업로드마다 분석하면 버려질 스냅까지 과금된다
 * (docs/decisions/snap-content-analysis.md §3). 그래서 자동 적재 경로를 두지 않고,
 * 이 서비스를 호출하는 쪽(현재는 앱의 명시적 요청, 이후 추천 경로)이 후보를 지정한다.
 *
 * 결과는 추천 입력이므로 `Video` 응답에는 아무 필드도 추가하지 않는다.
 */
import type {
  VideoAnalysis,
  VideoAnalysisErrorCode,
  VideoAnalysisStatus,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { enqueueVideoAnalysis } from '../queue/video-analysis-queue.js';

/**
 * 현재 모델·프롬프트 세대. 모델이나 프롬프트를 바꿔 기존 결과와 비교하려면 이 값을 올린다
 * (기존 행은 남고 새 버전 행이 생긴다). 일반 조회는 항상 최신 버전을 본다.
 */
export const ANALYSIS_VERSION = 1;

/** 재시도해도 결과가 달라지지 않는 코드. 재요청 시 새로 큐에 넣지 않는다. */
const TERMINAL_ERROR_CODES: ReadonlySet<string> = new Set<VideoAnalysisErrorCode>([
  'AUTH_FAILED',
  'BAD_REQUEST',
  'MODEL_NOT_FOUND',
  'SAFETY_REFUSED',
  'FRAME_EXTRACTION_FAILED',
]);

interface AnalysisRow {
  id: string;
  videoId: string;
  analysisVersion: number;
  status: string;
  durationMs: number | null;
  frameTimestampsMs: number[];
  summary: string | null;
  topics: string[];
  places: string[];
  objects: string[];
  actions: string[];
  moods: string[];
  visualQualityScore: number | null;
  visualIssues: string[];
  usableForEdit: boolean | null;
  confidence: number | null;
  modelVersion: string | null;
  promptVersion: string | null;
  attempts: number;
  errorCode: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

const SELECT = {
  id: true,
  videoId: true,
  analysisVersion: true,
  status: true,
  durationMs: true,
  frameTimestampsMs: true,
  summary: true,
  topics: true,
  places: true,
  objects: true,
  actions: true,
  moods: true,
  visualQualityScore: true,
  visualIssues: true,
  usableForEdit: true,
  confidence: true,
  modelVersion: true,
  promptVersion: true,
  attempts: true,
  errorCode: true,
  completedAt: true,
  createdAt: true,
} as const;

export function isRetryableErrorCode(code: string | null): boolean {
  return code !== null && !TERMINAL_ERROR_CODES.has(code);
}

function toDto(row: AnalysisRow): VideoAnalysis {
  const status = row.status as VideoAnalysisStatus;
  return {
    id: row.id,
    videoId: row.videoId,
    version: row.analysisVersion,
    status,
    // 내부 오류 메시지는 내리지 않는다 — 분류 코드와 재시도 가능 여부만 계약이다.
    error:
      status === 'failed' && row.errorCode
        ? {
            code: row.errorCode as VideoAnalysisErrorCode,
            retryable: isRetryableErrorCode(row.errorCode),
          }
        : null,
    result:
      status === 'done' && row.summary !== null
        ? {
            durationMs: row.durationMs,
            frameTimestampsMs: row.frameTimestampsMs,
            summary: row.summary,
            topics: row.topics,
            places: row.places,
            objects: row.objects,
            actions: row.actions,
            moods: row.moods,
            visualQuality: {
              score: row.visualQualityScore ?? 0,
              issues: row.visualIssues,
              usableForEdit: row.usableForEdit ?? false,
            },
            confidence: row.confidence,
          }
        : null,
    modelVersion: row.modelVersion,
    promptVersion: row.promptVersion,
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** 본인 소유의 분석 가능한 source 스냅인지 확인한다. 남의 것·삭제된 것은 404. */
async function requireAnalyzableVideo(params: {
  userId: string;
  videoId: string;
}): Promise<{ id: string }> {
  const video = await getPrisma().video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null, kind: 'source' },
    select: { id: true, status: true },
  });
  if (!video) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }
  if (video.status !== 'ready') {
    throw AppError.badRequest('업로드가 확정된 영상만 분석할 수 있습니다.');
  }
  return { id: video.id };
}

/**
 * 분석 요청. 같은 스냅에 대해 **버전당 한 행**만 만들고, 이미 있으면 그 상태에 따라 처리한다.
 *
 *  - 없음 → 생성 후 적재
 *  - queued/processing → 그대로 반환하고 같은 job id 로 다시 적재(큐에서 유실된 작업 복구)
 *  - failed(재시도 가능) → 같은 행을 queued 로 되돌리고 재적재
 *  - failed(재시도 불가) → 409. 손상된 영상·정책 거절은 다시 넣어도 같은 결과다
 *  - done → 그대로 반환. 재분석은 버전을 올려야 한다
 */
export async function requestAnalysis(params: {
  userId: string;
  videoId: string;
}): Promise<{ analysis: VideoAnalysis; created: boolean }> {
  const prisma = getPrisma();
  await requireAnalyzableVideo(params);

  const existing = await prisma.videoAnalysis.findUnique({
    where: {
      videoId_analysisVersion: { videoId: params.videoId, analysisVersion: ANALYSIS_VERSION },
    },
    select: SELECT,
  });

  if (existing?.status === 'done') {
    return { analysis: toDto(existing), created: false };
  }
  if (existing?.status === 'failed' && !isRetryableErrorCode(existing.errorCode)) {
    throw AppError.conflict('이 영상은 다시 분석해도 같은 결과가 나옵니다.');
  }

  const row = existing
    ? await prisma.videoAnalysis.update({
        where: { id: existing.id },
        // 재시도는 같은 행을 재사용한다. attempts 는 워커가 실제 실행 시점에 올린다.
        data: { status: 'queued', errorCode: null, errorMessage: null, startedAt: null },
        select: SELECT,
      })
    : await prisma.videoAnalysis.create({
        data: {
          videoId: params.videoId,
          userId: params.userId,
          analysisVersion: ANALYSIS_VERSION,
          status: 'queued',
        },
        select: SELECT,
      });

  try {
    await enqueueVideoAnalysis({
      analysisId: row.id,
      videoId: row.videoId,
      userId: params.userId,
      analysisVersion: row.analysisVersion,
    });
  } catch (err) {
    // 적재 실패로 레코드를 실패 처리하지 않는다 — queued 로 남겨야 다음 요청이 다시 넣는다.
    // 원본 영상 상태도 건드리지 않는다(분석과 업로드는 독립이다).
    captureException(err, { analysisId: row.id, phase: 'video-analysis-enqueue' });
    throw new AppError(503, 'QUEUE_UNAVAILABLE', '분석 큐에 접근할 수 없습니다. 잠시 후 다시 시도하세요.');
  }

  return { analysis: toDto(row), created: existing === null };
}

/** 최신 버전 분석 1건. 분석을 요청한 적이 없으면 404. */
export async function getLatestAnalysis(params: {
  userId: string;
  videoId: string;
}): Promise<VideoAnalysis> {
  const video = await getPrisma().video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null },
    select: { id: true },
  });
  if (!video) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }

  const row = await getPrisma().videoAnalysis.findFirst({
    where: { videoId: params.videoId, userId: params.userId },
    orderBy: { analysisVersion: 'desc' },
    select: SELECT,
  });
  if (!row) {
    throw AppError.notFound('이 영상의 분석 기록이 없습니다.');
  }
  return toDto(row);
}
