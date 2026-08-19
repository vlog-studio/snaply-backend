/**
 * 템플릿 슬롯에 넣을 스냅 추천 — 접수와 조회.
 *
 * **새 큐를 만들지 않았다.** 비싼 일(분석)은 이미 `video-analysis` 큐가 지고 있고, 추천은 그
 * 결과를 모아 점수를 매기는 오케스트레이션이라 두 번째 큐는 첫 번째 큐를 기다리기만 한다.
 * 그래서 접수 시점에 후보 분석을 적재하고, **채점은 조회(폴링) 시점에** 한다. 아무도 폴링하지
 * 않으면 채점도 돌지 않는데, 그건 낭비가 아니라 절약이다
 * (docs/decisions/template-snap-recommendation.md §7).
 *
 * 후보를 고르는 쪽은 앱이다 — 서버는 스냅이 언제 어디서 찍혔는지 모른다(§6).
 */
import { createHash } from 'node:crypto';
import type {
  MovieRecommendation,
  MovieRecommendationExclusion,
  MovieRecommendationStatus,
} from '@vlog-studio/shared-types';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { ANALYSIS_VERSION, requestAnalysis } from './video-analysis.service.js';
import {
  DAILY_RECOMMENDATION_LIMIT,
  MAX_CANDIDATES,
  REUSE_WINDOW_MS,
  SCORING_DEADLINE_MS,
  isRecommendationEnabled,
} from './recommendation/recommendation-policy.js';
import {
  assignSlots,
  parseMatchHints,
  type ScoringCandidate,
  type ScoringSlot,
} from './recommendation/score-slots.js';

interface RecommendationRow {
  id: string;
  templateId: string;
  candidateVideoIds: string[];
  status: string;
  excluded: unknown;
  createdAt: Date;
  completedAt: Date | null;
  items: { slotId: string; position: number; videoId: string | null; score: number | null }[];
}

const SELECT = {
  id: true,
  templateId: true,
  candidateVideoIds: true,
  status: true,
  excluded: true,
  createdAt: true,
  completedAt: true,
  items: {
    orderBy: { position: 'asc' },
    select: { slotId: true, position: true, videoId: true, score: true },
  },
} as const;

function toDto(row: RecommendationRow): MovieRecommendation {
  return {
    id: row.id,
    templateId: row.templateId,
    status: row.status as MovieRecommendationStatus,
    slots: row.items.map((item) => ({
      slotId: item.slotId,
      videoId: item.videoId,
      score: item.score,
    })),
    excluded: Array.isArray(row.excluded) ? (row.excluded as MovieRecommendationExclusion[]) : [],
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/**
 * 후보 집합의 지문. **순서를 정렬해서** 넣는다 — 같은 외출을 두 번 보낼 때 앱이 순서를 살짝
 * 다르게 만들었다는 이유로 재분석이 돌면 안 된다. 순서 자체는 행의 배열 컬럼에 남는다.
 */
function candidateHashOf(templateId: string, videoIds: readonly string[]): string {
  return createHash('sha256')
    .update(`${templateId}\n${[...videoIds].sort().join(',')}`)
    .digest('hex');
}

function requireEnabled(): void {
  if (!isRecommendationEnabled()) {
    throw new AppError(
      503,
      'RECOMMENDATION_DISABLED',
      '스냅 추천이 아직 활성화되지 않았습니다.',
    );
  }
}

/** 중복을 지우되 앱이 보낸 순서(촬영 시간 오름차순)는 지킨다. 이 순서가 시간 사전값이다. */
function dedupeInOrder(videoIds: readonly string[]): string[] {
  return [...new Set(videoIds)];
}

/**
 * 추천 접수.
 *
 * **멱등하다.** 같은 (유저·템플릿·후보 집합)이 재사용 창 안에서 다시 오면 새로 만들지 않고
 * 기존 추천을 돌려준다. 사용자가 템플릿 화면을 다시 열 때마다 재분석하면 그게 그대로 비용이다.
 */
export async function requestRecommendation(params: {
  userId: string;
  templateId: string;
  candidateVideoIds: readonly string[];
}): Promise<{ recommendation: MovieRecommendation; created: boolean }> {
  requireEnabled();
  const prisma = getPrisma();
  const candidates = dedupeInOrder(params.candidateVideoIds);

  if (candidates.length === 0) {
    throw AppError.badRequest('후보 스냅이 필요합니다.');
  }
  if (candidates.length > MAX_CANDIDATES) {
    throw new AppError(
      400,
      'TOO_MANY_CANDIDATES',
      `후보 스냅은 한 번에 ${MAX_CANDIDATES}개까지 보낼 수 있습니다.`,
      { max: MAX_CANDIDATES },
    );
  }

  const template = await prisma.movieTemplate.findFirst({
    where: { id: params.templateId, retiredAt: null },
    select: { id: true },
  });
  if (!template) {
    throw AppError.notFound('템플릿을 찾을 수 없습니다.');
  }

  // 소유·source·ready 를 한 번에 본다. 하나라도 어긋나면 어느 것인지 알려주지 않는다 —
  // 남의 영상 id 를 넣어 존재 여부를 떠보는 경로가 되면 안 된다.
  const owned = await prisma.video.count({
    where: {
      id: { in: candidates },
      userId: params.userId,
      kind: 'source',
      status: 'ready',
      deletedAt: null,
    },
  });
  if (owned !== candidates.length) {
    throw AppError.forbidden('추천에 쓸 수 없는 스냅이 포함돼 있습니다.');
  }

  const now = Date.now();
  const windowStart = new Date(now - REUSE_WINDOW_MS);
  const candidateHash = candidateHashOf(params.templateId, candidates);

  const existing = await prisma.movieRecommendation.findFirst({
    where: {
      userId: params.userId,
      templateId: params.templateId,
      candidateHash,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  });
  if (existing) {
    return { recommendation: toDto(existing), created: false };
  }

  // 한도는 새 추천에만 건다. 재사용은 비용이 0이므로 막을 이유가 없다.
  const recent = await prisma.movieRecommendation.count({
    where: { userId: params.userId, createdAt: { gte: windowStart } },
  });
  if (recent >= DAILY_RECOMMENDATION_LIMIT) {
    throw new AppError(
      429,
      'RECOMMENDATION_LIMIT',
      '오늘 받을 수 있는 추천 수를 모두 썼습니다. 잠시 후 다시 시도하세요.',
    );
  }

  await enqueueCandidateAnalyses(params.userId, candidates);

  const created = await prisma.movieRecommendation.create({
    data: {
      userId: params.userId,
      templateId: params.templateId,
      candidateVideoIds: candidates,
      candidateHash,
      status: 'processing',
    },
    select: SELECT,
  });

  return { recommendation: toDto(created), created: true };
}

/**
 * 후보별 분석 적재.
 *
 * 개별 후보의 거절은 추천을 실패시키지 않는다 — 손상된 스냅 하나 때문에 나머지 열한 개의
 * 추천을 포기하는 것이 더 나쁘고, 그 후보는 채점에서 이유와 함께 빠진다. 다만 **큐 자체가
 * 죽은 경우(503)는 올린다.** 그때 만든 추천은 채워질 수 없고, 마감 시한까지 기다린 끝에
 * 빈 결과가 되기 때문이다.
 */
async function enqueueCandidateAnalyses(userId: string, videoIds: readonly string[]): Promise<void> {
  for (const videoId of videoIds) {
    try {
      await requestAnalysis({ userId, videoId });
    } catch (err) {
      if (err instanceof AppError && err.code === 'QUEUE_UNAVAILABLE') throw err;
      if (err instanceof AppError) continue;
      captureException(err, { videoId, phase: 'recommendation-analysis-request' });
    }
  }
}

/**
 * 추천 조회. 아직 `processing` 이면 이 시점에 채점을 시도한다.
 *
 * 분석이 다 끝났으면 배정하고 `done` 으로 굳힌다. 아직이면 그대로 `processing` 을 돌려주되,
 * 마감 시한을 넘겼으면 남은 것만으로 채점한다 — 분석 워커가 죽었을 때 추천이 영원히
 * 걸려 있으면 안 된다.
 */
export async function getRecommendation(params: {
  userId: string;
  recommendationId: string;
}): Promise<MovieRecommendation> {
  const prisma = getPrisma();
  const row = await prisma.movieRecommendation.findFirst({
    where: { id: params.recommendationId, userId: params.userId },
    select: SELECT,
  });
  if (!row) {
    throw AppError.notFound('추천을 찾을 수 없습니다.');
  }
  if (row.status !== 'processing') {
    return toDto(row);
  }
  return toDto(await scoreIfReady(row));
}

async function scoreIfReady(row: RecommendationRow): Promise<RecommendationRow> {
  const prisma = getPrisma();

  const slots = await prisma.movieTemplateSlot.findMany({
    where: { templateId: row.templateId },
    orderBy: { position: 'asc' },
    select: { slotId: true, position: true, matchHints: true },
  });
  if (slots.length === 0) {
    // 템플릿에 슬롯이 없으면 채울 자리가 없다. 기다려도 달라지지 않으므로 바로 닫는다.
    return finalize(row, [], []);
  }

  const analyses = await prisma.videoAnalysis.findMany({
    where: { videoId: { in: row.candidateVideoIds }, analysisVersion: ANALYSIS_VERSION },
    select: {
      videoId: true,
      status: true,
      topics: true,
      places: true,
      objects: true,
      actions: true,
      visualQualityScore: true,
      usableForEdit: true,
      confidence: true,
    },
  });
  const byVideoId = new Map(analyses.map((analysis) => [analysis.videoId, analysis]));

  const pending = row.candidateVideoIds.filter((videoId) => {
    const status = byVideoId.get(videoId)?.status;
    return status === undefined || status === 'queued' || status === 'processing';
  });

  const expired = Date.now() - row.createdAt.getTime() >= SCORING_DEADLINE_MS;
  if (pending.length > 0 && !expired) {
    return row;
  }

  const candidates: ScoringCandidate[] = row.candidateVideoIds.map((videoId, index) => {
    const analysis = byVideoId.get(videoId);
    return {
      videoId,
      index,
      // 실패했거나 시한 안에 못 끝낸 분석은 똑같이 "쓸 정보가 없다"로 다룬다.
      analysis:
        analysis?.status === 'done'
          ? {
              topics: analysis.topics,
              places: analysis.places,
              objects: analysis.objects,
              actions: analysis.actions,
              visualQualityScore: analysis.visualQualityScore,
              usableForEdit: analysis.usableForEdit,
              confidence: analysis.confidence,
            }
          : null,
    };
  });

  const scoringSlots: ScoringSlot[] = slots.map((slot) => ({
    slotId: slot.slotId,
    position: slot.position,
    hints: parseMatchHints(slot.matchHints),
  }));

  const result = assignSlots(scoringSlots, candidates);
  return finalize(row, result.slots, result.excluded);
}

/**
 * 채점 결과를 굳힌다.
 *
 * `status: 'processing'` 조건부 갱신이라, 두 폴링이 동시에 채점해도 먼저 도착한 쪽만 쓴다.
 * 진 쪽은 자기 계산을 버리고 저장된 행을 읽는다 — 같은 입력에 같은 배정이 나오므로 결과는 같다.
 */
async function finalize(
  row: RecommendationRow,
  slots: { slotId: string; position: number; videoId: string | null; score: number | null }[],
  excluded: MovieRecommendationExclusion[],
): Promise<RecommendationRow> {
  const prisma = getPrisma();

  const won = await prisma.movieRecommendation.updateMany({
    where: { id: row.id, status: 'processing' },
    data: {
      status: 'done',
      completedAt: new Date(),
      excluded: excluded as unknown as Prisma.InputJsonValue,
    },
  });

  if (won.count > 0 && slots.length > 0) {
    await prisma.movieRecommendationItem.createMany({
      data: slots.map((slot) => ({
        recommendationId: row.id,
        slotId: slot.slotId,
        position: slot.position,
        videoId: slot.videoId,
        score: slot.score,
      })),
      skipDuplicates: true,
    });
  }

  const stored = await prisma.movieRecommendation.findUnique({
    where: { id: row.id },
    select: SELECT,
  });
  return stored ?? row;
}
