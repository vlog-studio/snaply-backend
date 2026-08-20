/**
 * 스테이지 어휘와 시드 구조의 정합성을 고정한다.
 *
 * 원본은 `packages/shared-types/src/stage-vocabulary.json` **하나**이고 워커(`pipeline/seed.py`)도
 * 같은 파일을 읽는다. 스테이지 이름이 갈리면 **조용히** 실패한다 — `attempt` 키가 디렉터의
 * 실제 이름과 한 글자라도 다르면 그 디렉터는 `attempt=0` 을 보고, 사용자가 "다시 생성"을
 * 눌러도 같은 영상이 나오며 에러가 남지 않는다.
 *
 * 시드 **파생**은 워커 단독이라 여기서 검증하지 않는다(§1.3 파생 공식과 같은 이유).
 * 파생의 계약은 `apps/ai-worker/tests/fixtures/stage-seed.json` 골든 값이다.
 *
 * DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEEDED_STAGES,
  SEED_ROOT_MAX,
  STAGE_NAMES,
  STAGE_VOCABULARY_VERSION,
  bumpAttempt,
  createSeed,
  isSeededStage,
  isValidSeed,
  resolveAttempts,
  type SpecSeed,
} from '@vlog-studio/shared-types';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const VOCABULARY_PATH = join(
  REPO_ROOT,
  'packages',
  'shared-types',
  'src',
  'stage-vocabulary.json',
);

interface VocabularyStage {
  order: number;
  kind: string;
  seeded: boolean;
  description: string;
}

interface VocabularyFile {
  stageVocabularyVersion: number;
  seedAlgorithm: string;
  seedTemplate: string;
  seedBytes: number;
  seedByteOrder: string;
  rootMax: number;
  stages: Record<string, VocabularyStage>;
}

const vocabulary = JSON.parse(readFileSync(VOCABULARY_PATH, 'utf-8')) as VocabularyFile;

function stagesInOrder(): string[] {
  return Object.entries(vocabulary.stages)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([name]) => name);
}

describe('스테이지 어휘 ↔ TypeScript 상수', () => {
  it('스테이지 목록과 순서가 사전과 같다', () => {
    expect([...STAGE_NAMES]).toEqual(stagesInOrder());
  });

  it('시드를 쓰는 스테이지가 사전과 같다', () => {
    const seeded = stagesInOrder().filter((name) => vocabulary.stages[name]?.seeded);
    expect([...SEEDED_STAGES]).toEqual(seeded);
  });

  it('버전과 root 상한이 사전에서 온다', () => {
    expect(STAGE_VOCABULARY_VERSION).toBe(vocabulary.stageVocabularyVersion);
    expect(SEED_ROOT_MAX).toBe(vocabulary.rootMax);
  });

  it('root 상한이 JavaScript 안전 정수다', () => {
    // 넘으면 JS 가 반올림해 API 가 쓴 root 와 워커가 읽은 root 가 달라지고,
    // 에러 없이 다른 영상이 나온다.
    expect(SEED_ROOT_MAX).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('사전 자체의 내부 정합성', () => {
  it('시드를 쓰는 스테이지는 전부 디렉터다', () => {
    // 리더는 MediaPipe·VAD 라 결정적이고 semantic 은 analysisVersion 으로 핀된다.
    for (const [name, stage] of Object.entries(vocabulary.stages)) {
      if (stage.seeded) {
        expect(stage.kind, name).toBe('director');
      }
    }
  });

  it('order 가 0 부터 빈틈없이 이어진다', () => {
    const orders = Object.values(vocabulary.stages)
      .map((stage) => stage.order)
      .sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, index) => index));
  });

  it('시드 알고리즘이 이름으로 박혀 있다', () => {
    // 언어 기본 해시를 쓰면 파이썬의 PYTHONHASHSEED 때문에 프로세스마다 값이 달라진다.
    // 바이트 수·바이트 순서까지 있어야 두 번째 구현이 같은 값을 낼 수 있다.
    expect(vocabulary.seedAlgorithm).toBe('sha256');
    expect(vocabulary.seedTemplate).toBe('{root}:{stage}:{attempt}');
    expect(vocabulary.seedBytes).toBe(8);
    expect(vocabulary.seedByteOrder).toBe('big');
  });
});

describe('시드 구조 검증', () => {
  it('오타 난 스테이지 이름을 통과시키지 않는다', () => {
    // 통과시키면 그 디렉터는 attempt=0 을 보고 "다시 생성"이 아무 일도 하지 않는다.
    expect(isSeededStage('style-director')).toBe(true);
    expect(isSeededStage('style-directr')).toBe(false);
    expect(isSeededStage('visual-reader')).toBe(false);
    expect(isValidSeed({ root: 7, attempt: { 'style-directr': 1 } })).toBe(false);
    expect(isValidSeed({ root: 7, attempt: { 'visual-reader': 1 } })).toBe(false);
  });

  it('root 범위를 강제한다', () => {
    expect(isValidSeed({ root: 0, attempt: {} })).toBe(true);
    expect(isValidSeed({ root: SEED_ROOT_MAX, attempt: {} })).toBe(true);
    expect(isValidSeed({ root: SEED_ROOT_MAX + 1, attempt: {} })).toBe(false);
    expect(isValidSeed({ root: -1, attempt: {} })).toBe(false);
    expect(isValidSeed({ root: 1.5, attempt: {} })).toBe(false);
  });

  it('형태가 어긋난 시드를 거부한다', () => {
    expect(isValidSeed(null)).toBe(false);
    expect(isValidSeed({})).toBe(false);
    expect(isValidSeed({ root: 7, attempt: [] })).toBe(false);
    expect(isValidSeed({ root: 7, attempt: { 'edit-director': -1 } })).toBe(false);
    // attempt 생략은 허용 — 워커가 전부 0 으로 채운다.
    expect(isValidSeed({ root: 7 })).toBe(true);
  });

  it('createSeed 가 범위를 벗어난 root 를 거부한다', () => {
    expect(createSeed(1837462)).toEqual({ root: 1837462, attempt: {} });
    expect(() => createSeed(SEED_ROOT_MAX + 1)).toThrow(RangeError);
  });
});

describe('attempt 증가', () => {
  const base: SpecSeed = { root: 1837462, attempt: { 'style-director': 2 } };

  it('원본을 바꾸지 않는다', () => {
    // 스펙은 영구 저장물이라 제자리 수정이 과거 산출물의 재현을 깨뜨린다.
    const next = bumpAttempt(base, 'style-director');
    expect(next.attempt['style-director']).toBe(3);
    expect(base.attempt['style-director']).toBe(2);
    expect(next).not.toBe(base);
  });

  it('건드리지 않은 스테이지는 그대로다', () => {
    // 부분 재생성의 핵심 — "스티커만 다시"가 컷을 바꾸면 무효화 표의 유지 범위가 무너진다.
    const next = bumpAttempt(base, 'style-director');
    expect(next.attempt['edit-director']).toBeUndefined();
    expect(resolveAttempts(next)['edit-director']).toBe(0);
  });

  it('처음 올리는 스테이지는 0 에서 시작한다', () => {
    expect(bumpAttempt(base, 'edit-director').attempt['edit-director']).toBe(1);
  });

  it('resolveAttempts 가 빠진 스테이지를 0 으로 채운다', () => {
    // 워커의 parse_seed 와 같은 규칙이어야 한다.
    expect(resolveAttempts(base)).toEqual({
      'music-director': 0,
      'edit-director': 0,
      'style-director': 2,
    });
  });

  it('증가한 시드도 유효하다', () => {
    expect(isValidSeed(bumpAttempt(base, 'music-director'))).toBe(true);
  });
});
