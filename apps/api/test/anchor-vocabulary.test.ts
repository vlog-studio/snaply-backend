/**
 * 앵커 어휘 사전의 정합성을 고정한다.
 *
 * 사전의 원본은 `packages/shared-types/src/anchor-vocabulary.json` **하나**이고,
 * TypeScript(`anchor.ts`)와 워커(`pipeline/anchor.py`)가 같은 파일을 읽는다. 코드젠도 수동
 * 동기화도 없는 대신, **한쪽이 사전을 안 따라온 경우를 이 테스트가 잡는다.**
 *
 * TS 는 타입이 컴파일 타임에만 있어 런타임 배열(`ANCHOR_KINDS` 등)을 따로 들 수밖에 없다.
 * 그 배열과 JSON 을 대조하는 것이 유일한 방법이다. 워커 쪽 대조는
 * `apps/ai-worker/tests/test_anchor.py` 가 맡는다.
 *
 * DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR_KINDS,
  ANCHOR_REFS,
  DERIVATION_VERSION,
  SCALE_REFS,
  TIE_EPSILON,
  VOCABULARY_VERSION,
  isValidAnchor,
  isValidAnchorAffinity,
  isValidFallbackChain,
  type AnchorKind,
} from '@vlog-studio/shared-types';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const VOCABULARY_PATH = join(
  REPO_ROOT,
  'packages',
  'shared-types',
  'src',
  'anchor-vocabulary.json',
);

interface VocabularyKind {
  requiresAnalysis: string | null;
  refs: string[];
  defaultScaleRef: string | null;
  supportsRotation: boolean;
}

interface VocabularyFile {
  vocabularyVersion: number;
  derivationVersion: number;
  scaleRefs: string[];
  tieEpsilon: number;
  faceKeypoints: { available: string[]; requiredForDerivation: string[] };
  kinds: Record<string, VocabularyKind>;
}

const vocabulary = JSON.parse(readFileSync(VOCABULARY_PATH, 'utf-8')) as VocabularyFile;

describe('앵커 사전 ↔ TypeScript 상수', () => {
  it('kind 목록이 사전과 같다', () => {
    expect([...ANCHOR_KINDS].sort()).toEqual(Object.keys(vocabulary.kinds).sort());
  });

  it('kind 별 ref 목록이 사전과 같다', () => {
    for (const kind of ANCHOR_KINDS) {
      expect([...(ANCHOR_REFS[kind] ?? [])].sort(), kind).toEqual(
        [...(vocabulary.kinds[kind]?.refs ?? [])].sort(),
      );
    }
  });

  it('scaleRef 목록이 사전과 같다', () => {
    expect([...SCALE_REFS].sort()).toEqual([...vocabulary.scaleRefs].sort());
  });

  it('버전 상수가 사전에서 온다', () => {
    expect(VOCABULARY_VERSION).toBe(vocabulary.vocabularyVersion);
    expect(DERIVATION_VERSION).toBe(vocabulary.derivationVersion);
  });

  it('동률 판정 여유가 사전에서 온다', () => {
    // 공식은 워커 단독이지만 이 값은 계약이다 — 앱 프리뷰 구현이 다른 값을 쓰면
    // 같은 입력에서 스티커가 반대쪽에 붙고 픽스처가 계약 역할을 못 한다.
    expect(TIE_EPSILON).toBe(vocabulary.tieEpsilon);
    // 정규화 좌표의 잡음(~1e-16)보다 크고, 1080px 에서 눈에 보이는 거리보다 훨씬 작아야 한다.
    expect(TIE_EPSILON).toBeGreaterThan(1e-15);
    expect(TIE_EPSILON).toBeLessThan(1e-6);
  });
});

describe('사전 자체의 내부 정합성', () => {
  it('defaultScaleRef 는 scaleRefs 안의 값이거나 null 이다', () => {
    for (const [kind, entry] of Object.entries(vocabulary.kinds)) {
      if (entry.defaultScaleRef !== null) {
        expect(vocabulary.scaleRefs, kind).toContain(entry.defaultScaleRef);
      }
    }
  });

  it('ref 를 갖지 않는 kind 는 drop 뿐이다', () => {
    const empty = Object.entries(vocabulary.kinds)
      .filter(([, entry]) => entry.refs.length === 0)
      .map(([kind]) => kind);
    expect(empty).toEqual(['drop']);
  });

  it('drop 은 분석도 스케일 기준도 요구하지 않는다', () => {
    // 폴백 종점이 무언가를 요구하면 체인이 끝까지 못 간다.
    expect(vocabulary.kinds.drop?.requiresAnalysis).toBeNull();
    expect(vocabulary.kinds.drop?.defaultScaleRef).toBeNull();
  });

  it('회전을 지원하는 kind 는 face 뿐이다', () => {
    // 얼굴만 roll(양 눈 각도)을 주고, 텍스트 배지류는 기울면 읽기 어려워진다.
    const rotatable = Object.entries(vocabulary.kinds)
      .filter(([, entry]) => entry.supportsRotation)
      .map(([kind]) => kind);
    expect(rotatable).toEqual(['face']);
  });

  it('파생에 필요한 키포인트는 MediaPipe 가 주는 6키포인트 안에 있다', () => {
    for (const name of vocabulary.faceKeypoints.requiredForDerivation) {
      expect(vocabulary.faceKeypoints.available).toContain(name);
    }
  });

  it('face 의 ref 중 MediaPipe 키포인트 이름과 겹치는 것이 없다', () => {
    // 겹치면 "랜드마크를 그대로 쓴다"는 오해가 생긴다. face 의 ref 는 전부 파생값이다.
    for (const ref of vocabulary.kinds.face?.refs ?? []) {
      expect(vocabulary.faceKeypoints.available, ref).not.toContain(ref);
    }
  });
});

describe('앵커 검증 헬퍼', () => {
  it('kind 별 ref 가 실제로 갈라져 있다', () => {
    expect(isValidAnchor({ kind: 'face', ref: 'aboveHead' })).toBe(true);
    expect(isValidAnchor({ kind: 'hand', ref: 'aboveHead' })).toBe(false);
    expect(isValidAnchor({ kind: 'freezone', ref: 'topRight' })).toBe(true);
    expect(isValidAnchor({ kind: 'safeArea', ref: 'topRight' })).toBe(false);
  });

  it('drop 만 ref 를 갖지 않는다', () => {
    expect(isValidAnchor({ kind: 'drop' })).toBe(true);
    expect(isValidAnchor({ kind: 'drop', ref: 'bboxCenter' })).toBe(false);
    expect(isValidAnchor({ kind: 'face' })).toBe(false);
  });

  it('알 수 없는 kind 는 통과하지 않는다', () => {
    expect(isValidAnchor({ kind: 'nose' as AnchorKind, ref: 'bboxCenter' })).toBe(false);
  });

  it('폴백 체인의 마지막은 반드시 drop 이다', () => {
    // 잘못 배치된 스티커는 없는 것보다 나쁘다 — 못 붙이면 안 붙인다가 스펙에 드러나야 한다.
    expect(
      isValidFallbackChain([
        { kind: 'face', ref: 'aboveHead' },
        { kind: 'freezone', ref: 'topRight' },
        { kind: 'drop' },
      ]),
    ).toBe(true);
    expect(isValidFallbackChain([{ kind: 'face', ref: 'aboveHead' }])).toBe(false);
    expect(isValidFallbackChain([])).toBe(false);
  });

  it('anchorAffinity 는 drop 을 포함하면 안 된다', () => {
    // fallback 과 **정반대** 규칙이라 헷갈리기 쉽다: fallback 은 drop 으로 끝나야 하고
    // anchorAffinity 는 drop 을 포함하면 안 된다. drop 은 isValidAnchor 를 통과하므로
    // 전용 검증이 없으면 매니페스트에 들어가도 아무도 모른다.
    expect(
      isValidAnchorAffinity([
        { kind: 'face', ref: 'aboveHead' },
        { kind: 'freezone', ref: 'topRight' },
      ]),
    ).toBe(true);
    expect(
      isValidAnchorAffinity([{ kind: 'face', ref: 'aboveHead' }, { kind: 'drop' }]),
    ).toBe(false);
    expect(isValidAnchorAffinity([])).toBe(false);
    expect(isValidAnchorAffinity([{ kind: 'hand', ref: 'aboveHead' }])).toBe(false);
  });

  it('같은 배열이 fallback 과 affinity 에서 반대로 판정된다', () => {
    // 두 규칙이 정말 반대라는 것을 한 줄로 고정한다.
    const withDrop = [{ kind: 'face', ref: 'aboveHead' }, { kind: 'drop' }] as const;
    expect(isValidFallbackChain(withDrop)).toBe(true);
    expect(isValidAnchorAffinity(withDrop)).toBe(false);
  });

  it('체인 중간에 잘못된 앵커가 있으면 통과하지 않는다', () => {
    expect(
      isValidFallbackChain([
        { kind: 'hand', ref: 'aboveHead' },
        { kind: 'drop' },
      ]),
    ).toBe(false);
  });
});
