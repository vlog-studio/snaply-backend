import { createHash } from 'node:crypto';

import { validateTransition, type StylePreset, type Transition } from '@vlog-studio/shared-types';

/**
 * AI 가 경계마다 고르는 전환(specs/movie.md MOV-22). 규칙과 근거는 docs/decisions/transition-director.md.
 *
 * **규칙과 시드로 고른다**(decisions/auto-edit-draft.md §3). 모델을 부르지 않으므로 무비마다 비용이
 * 없고, 같은 입력이면 같은 전환이 나온다.
 *
 * **컷 길이는 입력이 아니다.** 트림은 전환을 다시 고르지 않는다(무효화 사전 `cut-trim`:
 * `timeline.transitions` 는 `retimed`). 컷이 짧거나 여분 프레임이 없어 들어가지 않는 전환은
 * `resolveTransition` 의 폴백이 맡는다 — 그래야 사용자가 구간을 조금 고쳤다고 전환이 바뀌지 않는다.
 */

/** 두 스냅의 촬영 시각이 이만큼 떨어져 있으면 장면이 바뀐 것으로 본다. */
export const SCENE_GAP_MS = 30 * 60 * 1000;

interface StyleRule {
  /** 장면이 바뀐 경계(촬영 시각 간격 ≥ SCENE_GAP_MS). 시간이 흘렀다는 표시라 섞지 않는다. */
  sceneChange: Transition;
  /** 첫 경계 — 첫 컷에서 본론으로 들어가는 자리. 없으면 아래 가중치를 따른다. */
  opening?: Transition;
  /** 같은 장면 안의 경계. 시드로 뽑는다. */
  weighted: Array<[Transition, number]>;
}

const t = validateTransition;

/**
 * 스타일마다의 경향. 스타일 카드의 설명(앱 `movie-style.ts`)과 맞아야 한다 —
 * 일상 "컷 편집", 감성 "부드러운 전환", 여행 "빠른 컷 전환".
 */
const STYLE_RULES: Record<StylePreset, StyleRule> = {
  일상: {
    sceneChange: t({ kind: 'dip', durationMs: 400 }),
    weighted: [[{ kind: 'hardcut' }, 1]],
  },
  감성: {
    sceneChange: t({ kind: 'dip', durationMs: 600 }),
    weighted: [
      [t({ kind: 'crossfade', durationMs: 800 }), 0.8],
      [t({ kind: 'dip', durationMs: 500 }), 0.2],
    ],
  },
  여행: {
    sceneChange: t({ kind: 'flash', durationMs: 200 }),
    opening: t({ kind: 'zoompunch', durationMs: 300 }),
    weighted: [
      [{ kind: 'hardcut' }, 0.7],
      [t({ kind: 'zoompunch', durationMs: 300 }), 0.2],
      [t({ kind: 'flash', durationMs: 200 }), 0.1],
    ],
  },
};

/** 경계 하나의 두 컷. 촬영 시각은 밀리초(없으면 업로드 시각으로 대신한다). */
export interface DirectorBoundary {
  fromVideoId: string;
  toVideoId: string;
  fromCapturedAt: number;
  toCapturedAt: number;
}

/**
 * [0, 1) 균등값. 시드 규약은 스테이지 사전과 같다 — sha256 의 상위 8바이트를 빅엔디언으로
 * (stage-vocabulary.json `_seedNote`). 경계의 **위치가 아니라 두 컷**을 키로 삼아, 다른 곳의 순서를
 * 바꿔도 이 두 컷이 이어진 경계는 같은 전환을 받는다. `attempt` 는 아직 올릴 일이 없어 0 이다
 * ("다시 생성"이 생기면 올린다 — 무효화 사전 `user-regenerate`).
 */
function unit(movieId: string, boundary: DirectorBoundary, occurrence: number): number {
  const key = `${movieId}:edit-director:0:${boundary.fromVideoId}>${boundary.toVideoId}#${occurrence}`;
  const top = createHash('sha256').update(key).digest().readBigUInt64BE(0);
  return Number(top >> 11n) / 2 ** 53;
}

function draw(weighted: Array<[Transition, number]>, u: number): Transition {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let edge = 0;
  for (const [transition, weight] of weighted) {
    edge += weight / total;
    if (u < edge) return transition;
  }
  return weighted[weighted.length - 1]![0];
}

/** 경계마다(컷 순서대로) AI 가 고른 전환. */
export function pickTransitions(params: {
  movieId: string;
  stylePreset: StylePreset;
  boundaries: DirectorBoundary[];
}): Transition[] {
  const rule = STYLE_RULES[params.stylePreset];
  const seen = new Map<string, number>();
  return params.boundaries.map((boundary, index) => {
    // 같은 두 스냅이 한 무비에서 두 번 이어질 수 있다 — 몇 번째인지로 구별한다.
    const pairKey = `${boundary.fromVideoId}>${boundary.toVideoId}`;
    const occurrence = seen.get(pairKey) ?? 0;
    seen.set(pairKey, occurrence + 1);

    if (Math.abs(boundary.toCapturedAt - boundary.fromCapturedAt) >= SCENE_GAP_MS) {
      return rule.sceneChange;
    }
    if (index === 0 && rule.opening !== undefined) {
      return rule.opening;
    }
    return draw(rule.weighted, unit(params.movieId, boundary, occurrence));
  });
}
