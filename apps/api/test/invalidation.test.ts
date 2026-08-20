/**
 * 재생성 무효화 규칙의 정합성을 고정한다.
 *
 * 원본은 `packages/shared-types/src/invalidation-vocabulary.json` **하나**이고
 * 워커(`pipeline/invalidation.py`)도 같은 파일을 읽는다. 여기서는 TS 상수가 사전을 따라오는지와
 * **두 사전(무효화 · 스테이지)이 서로 맞는지**를 본다 — 갈라지면 액션이 지목한 스테이지를
 * 워커가 거부해 그 액션 자체가 실행 불가가 된다.
 *
 * DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INVALIDATION_ACTIONS,
  INVALIDATION_VOCABULARY_VERSION,
  LAYER_STATES,
  SEEDED_STAGES,
  SPEC_LAYERS,
  actionNote,
  attemptBumpFor,
  isInvalidationAction,
  isPreservingAction,
  layerState,
  layersInState,
  pinPromotionFor,
  reinterpretedRefsFor,
} from '@vlog-studio/shared-types';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const VOCABULARY_PATH = join(
  REPO_ROOT,
  'packages',
  'shared-types',
  'src',
  'invalidation-vocabulary.json',
);

interface ActionEntry {
  order: number;
  label: string;
  layers: Record<string, string>;
  reinterpretedRefs: string[];
  pinPromotion: string[];
  attemptBump: string[];
  note: string;
}

interface VocabularyFile {
  invalidationVocabularyVersion: number;
  states: Record<string, string>;
  layers: string[];
  actions: Record<string, ActionEntry>;
}

const vocabulary = JSON.parse(readFileSync(VOCABULARY_PATH, 'utf-8')) as VocabularyFile;

const actionsInOrder = Object.entries(vocabulary.actions)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([name]) => name);

describe('무효화 사전 ↔ TypeScript 상수', () => {
  it('액션 목록과 순서가 사전과 같다', () => {
    expect([...INVALIDATION_ACTIONS]).toEqual(actionsInOrder);
  });

  it('레이어 목록이 사전과 같다', () => {
    expect([...SPEC_LAYERS]).toEqual(vocabulary.layers);
  });

  it('상태 목록이 사전과 같다', () => {
    expect([...LAYER_STATES].sort()).toEqual(Object.keys(vocabulary.states).sort());
  });

  it('버전이 사전에서 온다', () => {
    expect(INVALIDATION_VOCABULARY_VERSION).toBe(vocabulary.invalidationVocabularyVersion);
  });
});

describe('사전 자체의 내부 정합성', () => {
  it('모든 액션이 모든 레이어를 빠짐없이 판단한다', () => {
    // 생략을 허용하면 레이어를 새로 추가했을 때 아무도 판단하지 않은 채 기본값으로 굳는다.
    for (const action of INVALIDATION_ACTIONS) {
      for (const layer of SPEC_LAYERS) {
        expect(() => layerState(action, layer), `${action} × ${layer}`).not.toThrow();
      }
    }
  });

  it('사전에 없는 조합은 기본값이 아니라 예외다', () => {
    expect(() => layerState('bgm-swop' as never, 'music')).toThrow();
    expect(() => layerState('bgm-swap', 'timeline.beats' as never)).toThrow();
  });

  it('모든 액션이 근거를 갖는다', () => {
    // 근거 없는 행은 다음 사람이 고칠 때 무엇을 깨는지 알 수 없다.
    for (const action of INVALIDATION_ACTIONS) {
      expect(actionNote(action).trim(), action).not.toBe('');
    }
  });

  it('알 수 없는 액션 이름을 통과시키지 않는다', () => {
    expect(isInvalidationAction('bgm-swap')).toBe(true);
    expect(isInvalidationAction('bgm-swop')).toBe(false);
  });
});

describe('스테이지 사전과의 합의', () => {
  it('attempt 를 올리는 대상은 전부 시드를 쓰는 스테이지다', () => {
    // 리더를 지목하는 규칙이 들어오면 워커의 parse_seed 가 그 스펙을 거부해
    // 액션 자체가 실행 불가가 된다.
    const seeded = new Set<string>(SEEDED_STAGES);
    for (const action of INVALIDATION_ACTIONS) {
      for (const stage of vocabulary.actions[action]?.attemptBump ?? []) {
        expect(seeded, `${action} → ${stage}`).toContain(stage);
      }
    }
  });

  it('attemptBumpFor 가 사전 값을 그대로 돌려준다', () => {
    // 필터가 값을 조용히 삼키면 위 테스트가 통과해도 런타임 동작이 달라진다.
    for (const action of INVALIDATION_ACTIONS) {
      expect([...attemptBumpFor(action)], action).toEqual(
        vocabulary.actions[action]?.attemptBump,
      );
    }
  });
});

describe('계획이 약속한 규칙', () => {
  it('재현과 재생성은 레이어가 아니라 attempt 로 갈린다', () => {
    // 이 쌍이 attempt 열의 존재 이유다.
    expect(isPreservingAction('expired-regenerate')).toBe(true);
    expect(attemptBumpFor('expired-regenerate')).toEqual([]);
    expect(attemptBumpFor('user-regenerate')).toHaveLength(3);
  });

  it('출력 프로필·fitMode 변경은 아무것도 무효화하지 않는다', () => {
    // resolved.xy 가 소스 정규화라 성립한다(B-1).
    expect(isPreservingAction('output-profile-change')).toBe(true);
  });

  it('가드 안의 BGM 교체는 컷 구성을 유지한다', () => {
    // beatLength 가 권위고 길이는 파생이다(B-6).
    expect(layerState('bgm-swap', 'timeline.cuts')).toBe('retimed');
    expect(layerState('bgm-swap', 'music')).toBe('invalidated');
  });

  it('가드를 넘으면 타임라인을 다시 짠다', () => {
    // "곡만 바꿨는데 컷이 달라졌다"가 UI 에 드러나야 하는 행이다.
    expect(layerState('bgm-swap-beyond-guard', 'timeline.cuts')).toBe('invalidated');
    expect(attemptBumpFor('bgm-swap-beyond-guard')).toContain('edit-director');
  });

  it('팩 교체는 새 핀을 쓰는 재생성이다', () => {
    // 재조회 금지 규칙은 핀을 바꾸지 않는 재렌더에만 적용된다.
    expect(reinterpretedRefsFor('sticker-pack-swap')).toContain('assetRefs.stickerPack');
    expect(layerState('sticker-pack-swap', 'timeline.cuts')).toBe('preserved');
  });

  it('핀 승격은 사용자 재생성에서만 일어난다', () => {
    // 만료 재생성이 핀을 올리면 "복원"이 다른 영상을 낸다.
    const promoting = INVALIDATION_ACTIONS.filter((action) =>
      pinPromotionFor(action).includes('analysis'),
    );
    expect(promoting).toEqual(['user-regenerate']);
  });

  it('수동 컷 편집은 어떤 attempt 도 올리지 않는다', () => {
    // 사용자가 순서를 정했으므로 디렉터에 선택이 없다.
    expect(attemptBumpFor('cut-reorder')).toEqual([]);
    expect(attemptBumpFor('cut-remove')).toEqual([]);
  });

  it('클립 추가가 기존 분석을 재사용한다', () => {
    // analysis 를 스펙 밖 참조로 뺀 것의 실질 이득.
    expect(reinterpretedRefsFor('clip-add')).toContain('analysis');
    expect(layerState('clip-add', 'music')).toBe('preserved');
  });

  it('클립 추가는 색 매칭을 다시 계산한다', () => {
    // 색 통계는 결정적이라 기존 클립은 같은 값이 나온다. 그런데도 무효화하는 이유는
    // referenceClipId 재선정이다 — 추가된 클립이 기존 레퍼런스보다 노출·품질이 좋으면
    // 레퍼런스가 옮겨가고 모든 클립의 보정량이 실제로 달라진다.
    expect(layerState('clip-add', 'grade.match')).toBe('invalidated');
    // look 은 번들에서 오므로 클립 추가와 무관하다.
    expect(layerState('clip-add', 'grade.look')).toBe('preserved');
  });

  it('액센트는 룩이 아니라 컷을 따라간다', () => {
    // grade 아래 있지만 축이 다르다 — 이름 때문에 별개 레이어로 안 세는 오분류가 있었고,
    // 그래서 컷을 지워도 없는 컷을 가리키는 액센트가 스펙에 남았다.
    expect(layerState('cut-reorder', 'grade.accents')).toBe('invalidated');
    expect(layerState('cut-remove', 'grade.accents')).toBe('invalidated');
    // 액센트는 음악 sections 에서도 나온다 — 같은 액션에서 오버레이는 retimed 인데 여기만 다르다.
    expect(layerState('bgm-swap', 'grade.accents')).toBe('invalidated');
    expect(layerState('bgm-swap', 'overlays.stickers')).toBe('retimed');
    expect(layerState('sticker-pack-swap', 'grade.accents')).toBe('preserved');
  });

  it('색보정은 전면 재생성 외에는 살아남는다', () => {
    // 룩은 번들이 정하고 번들은 핀돼 있다. 컷을 지웠다고 색이 변하면 안 된다.
    for (const action of [
      'cut-remove',
      'cut-reorder',
      'sticker-pack-swap',
      'bgm-swap',
    ] as const) {
      expect(layerState(action, 'grade.look'), action).toBe('preserved');
      expect(layerState(action, 'grade.match'), action).toBe('preserved');
    }
  });

  it('layersInState 가 세 상태를 빠짐없이 나눈다', () => {
    for (const action of INVALIDATION_ACTIONS) {
      const total = LAYER_STATES.reduce(
        (sum, state) => sum + layersInState(action, state).length,
        0,
      );
      expect(total, action).toBe(SPEC_LAYERS.length);
    }
  });
});
