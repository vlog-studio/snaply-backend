import { createHash } from 'node:crypto';
import {
  MAX_DRAFT_SNAPS,
  type MovieDraft,
  type MovieDraftBody,
  type StylePreset,
} from '@vlog-studio/shared-types';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { enqueueSignals } from '../queue/rendition-queue.js';
import {
  SIGNALS_VERSION,
  directDraft,
  draftSeedRoot,
  type DraftAnalysis,
  type DraftCandidate,
  type DraftSignals,
} from './edit-director.js';
import { ANALYSIS_VERSION } from './video-analysis.service.js';

/**
 * AI 편집 초안의 제안(specs/movie.md MOV-21). 고르는 규칙은 `edit-director.ts`, 상한은
 * docs/decisions/auto-edit-draft.md §5.
 *
 * **무비를 만들지 않는다.** 앱의 무비는 기기에서 먼저 만들어지고 컷이 모두 업로드된 뒤에 서버로 오므로,
 * 업로드되지 않은 스냅이 섞인 초안은 서버가 무비로 만들 수 없다. 그래서 제안만 돌려주고 앱이 그 제안으로
 * 무비를 만든다 — 템플릿 추천과 같은 모양이다.
 *
 * **기다리지 않는다.** 신호는 업로드 때 계산해 두었으므로 요청 안에서 끝난다. 신호가 없는 스냅은 검사 없이
 * 들어가고, 신호 계산을 적재해 다음 요청부터 쓴다. vision 분석은 부르지 않는다 — 이미 있는 분석 결과만 얹는다.
 */

const DEFAULT_STYLE: StylePreset = '일상';

/** 최근 24시간 초안 수(잠정값 — 단가 실측 A-3 뒤 다시 정한다). */
export const DAILY_DRAFT_LIMIT = 10;
/** 같은 요청에 같은 제안을 돌려주는 창. 재사용은 횟수에 세지 않는다. */
export const DRAFT_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

type SnapInput = MovieDraftBody['snaps'][number];

function keyOf(snap: SnapInput): string {
  return 'videoId' in snap ? snap.videoId : snap.localId;
}

/** (스타일, 스냅 집합)의 해시. 업로드되지 않은 스냅은 촬영 시각까지 넣는다 — 시각이 바뀌면 자리가 바뀐다. */
function snapHashOf(stylePreset: StylePreset, snaps: SnapInput[]): string {
  const parts = snaps
    .map((snap) => ('videoId' in snap ? `v:${snap.videoId}` : `l:${snap.localId}@${Date.parse(snap.capturedAt)}`))
    .sort();
  return createHash('sha256').update(`${stylePreset}\n${parts.join(',')}`).digest('hex');
}

function dedupeByKey(snaps: SnapInput[]): SnapInput[] {
  const seen = new Set<string>();
  return snaps.filter((snap) => {
    const key = keyOf(snap);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function requestDraft(params: {
  userId: string;
  stylePreset?: StylePreset;
  snaps: SnapInput[];
}): Promise<MovieDraft> {
  const prisma = getPrisma();
  const stylePreset = params.stylePreset ?? DEFAULT_STYLE;
  const snaps = dedupeByKey(params.snaps);

  if (snaps.length > MAX_DRAFT_SNAPS) {
    throw new AppError(400, 'TOO_MANY_SNAPS', `스냅은 한 번에 ${MAX_DRAFT_SNAPS}개까지 넘길 수 있습니다.`, {
      max: MAX_DRAFT_SNAPS,
    });
  }

  const uploadedIds = snaps.flatMap((snap) => ('videoId' in snap ? [snap.videoId] : []));
  // 소유·source·ready 를 한 번에 본다. 어느 것이 어긋났는지 알려주지 않는다 — 남의 id 로 존재를 떠보지 못하게.
  const videos = await prisma.video.findMany({
    where: { id: { in: uploadedIds }, userId: params.userId, kind: 'source', status: 'ready', deletedAt: null },
    select: { id: true, s3Key: true, capturedAt: true, createdAt: true },
  });
  if (videos.length !== uploadedIds.length) {
    throw AppError.forbidden('초안에 쓸 수 없는 스냅이 포함돼 있습니다.');
  }

  const now = Date.now();
  const windowStart = new Date(now - DRAFT_REUSE_WINDOW_MS);
  const snapHash = snapHashOf(stylePreset, snaps);

  const reusable = await prisma.movieDraft.findFirst({
    where: { userId: params.userId, snapHash, complete: true, createdAt: { gte: windowStart } },
    orderBy: { createdAt: 'desc' },
    select: { result: true },
  });
  if (reusable) {
    return reusable.result as unknown as MovieDraft;
  }

  // 한도는 새 초안에만 건다. 재사용은 비용이 없다.
  const recent = await prisma.movieDraft.count({
    where: { userId: params.userId, createdAt: { gte: windowStart } },
  });
  if (recent >= DAILY_DRAFT_LIMIT) {
    throw new AppError(429, 'DRAFT_LIMIT', '오늘 받을 수 있는 초안 수를 모두 썼습니다. 잠시 후 다시 시도하세요.');
  }

  const [signalRows, analysisRows] = await Promise.all([
    prisma.videoSignals.findMany({ where: { videoId: { in: uploadedIds }, signalsVersion: SIGNALS_VERSION } }),
    // 이미 있는 분석만 쓴다. 분석 결과는 동의를 철회하면 지워지므로 남아 있는 것은 동의 아래 만든 것이다.
    prisma.videoAnalysis.findMany({
      where: { videoId: { in: uploadedIds }, userId: params.userId, analysisVersion: ANALYSIS_VERSION, status: 'done' },
      select: {
        videoId: true,
        usableForEdit: true,
        visualQualityScore: true,
        places: true,
        objects: true,
        actions: true,
      },
    }),
  ]);
  const signalsOf = new Map(signalRows.map((row) => [row.videoId, row]));
  const analysisOf = new Map(analysisRows.map((row) => [row.videoId, row]));
  const videoOf = new Map(videos.map((video) => [video.id, video]));

  const missing = videos.filter((video) => !signalsOf.has(video.id));
  await enqueueMissingSignals(params.userId, missing);

  const candidates = snaps.map((snap): DraftCandidate => {
    if (!('videoId' in snap)) {
      return { key: snap.localId, uploaded: false, capturedAt: Date.parse(snap.capturedAt), signals: null, analysis: null };
    }
    const video = videoOf.get(snap.videoId)!;
    const row = signalsOf.get(snap.videoId);
    const analysis = analysisOf.get(snap.videoId);
    const signals: DraftSignals | null = row
      ? {
          durationMs: row.durationMs,
          stepMs: row.stepMs,
          brightness: row.brightness,
          sharpness: row.sharpness,
          frameHashes: row.frameHashes,
          motion: row.motion,
          speech: row.speech as Array<[number, number]>,
        }
      : null;
    const draftAnalysis: DraftAnalysis | null = analysis
      ? {
          usableForEdit: analysis.usableForEdit,
          visualQualityScore: analysis.visualQualityScore,
          hasPlaces: analysis.places.length > 0,
          hasObjects: analysis.objects.length > 0,
          hasActions: analysis.actions.length > 0,
        }
      : null;
    return {
      key: snap.videoId,
      uploaded: true,
      // 촬영 시각이 없는 예전 스냅은 업로드 시각으로 대신한다(SNAP-10, 무비 정렬과 같은 기준).
      capturedAt: (video.capturedAt ?? video.createdAt).getTime(),
      signals,
      analysis: draftAnalysis,
    };
  });

  const direction = directDraft({
    seedRoot: draftSeedRoot(params.userId, snaps.map(keyOf)),
    stylePreset,
    candidates,
  });
  const uploaded = new Set(uploadedIds);
  const draft: MovieDraft = {
    stylePreset,
    cuts: direction.cuts.map((cut) =>
      uploaded.has(cut.key)
        ? {
            videoId: cut.key,
            ...(cut.startMs !== undefined ? { startMs: cut.startMs } : {}),
            ...(cut.endMs !== undefined ? { endMs: cut.endMs } : {}),
          }
        : { localId: cut.key },
    ),
    excluded: direction.excluded.map((key) => (uploaded.has(key) ? { videoId: key } : { localId: key })),
  };

  await prisma.movieDraft.create({
    data: {
      userId: params.userId,
      stylePreset,
      snapHash,
      complete: missing.length === 0,
      result: draft as unknown as Prisma.InputJsonValue,
    },
  });
  return draft;
}

/** 신호가 없는 스냅의 신호를 계산해 둔다. 실패해도 초안은 나간다 — 그 스냅은 검사 없이 들어갔을 뿐이다. */
async function enqueueMissingSignals(
  userId: string,
  videos: Array<{ id: string; s3Key: string | null }>,
): Promise<void> {
  for (const video of videos) {
    if (video.s3Key === null) continue;
    try {
      await enqueueSignals({ videoId: video.id, userId, s3Key: video.s3Key });
    } catch (err) {
      captureException(err, { videoId: video.id, phase: 'signals-enqueue' });
    }
  }
}
