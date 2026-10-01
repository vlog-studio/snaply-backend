/**
 * 컷 역할 어휘의 정합성과 자리 규칙을 고정한다.
 *
 * 원본은 `packages/shared-types/src/cut-role-vocabulary.json` **하나**이고 워커
 * (`pipeline/cut_role.py`)도 같은 파일을 같은 규칙으로 검사한다(`tests/test_cut_role.py`).
 *
 * DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CUT_ROLES,
  CUT_ROLE_POSITIONS,
  CUT_ROLE_SIGNALS,
  CUT_ROLE_SOURCES,
  CUT_ROLE_VOCABULARY_VERSION,
  DEFAULT_CUT_ROLE,
  cutRolesAllowedAt,
  isCutRole,
  isCutRoleJudgeable,
} from '@vlog-studio/shared-types';

const SHARED_TYPES = join(fileURLToPath(new URL('../../..', import.meta.url)), 'packages', 'shared-types');

interface VocabularyFile {
  cutRoleVocabularyVersion: number;
  positions: Record<string, string>;
  sources: Record<string, string>;
  signals: Record<string, { source: string }>;
  default: string;
  roles: Record<string, { order: number; position: string; signals: string[] }>;
}

const vocabulary = JSON.parse(
  readFileSync(join(SHARED_TYPES, 'src', 'cut-role-vocabulary.json'), 'utf-8'),
) as VocabularyFile;

describe('cut role vocabulary', () => {
  it('exports the file version', () => {
    expect(CUT_ROLE_VOCABULARY_VERSION).toBe(vocabulary.cutRoleVocabularyVersion);
  });

  it('lists the roles in the file order', () => {
    const byOrder = Object.entries(vocabulary.roles)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([name]) => name);
    expect([...CUT_ROLES]).toEqual(byOrder);
    expect(byOrder.map((name) => vocabulary.roles[name]!.order)).toEqual(byOrder.map((_, i) => i));
  });

  it('declares the same positions, sources and signals as the TS tuples', () => {
    expect([...CUT_ROLE_POSITIONS].sort()).toEqual(Object.keys(vocabulary.positions).sort());
    expect([...CUT_ROLE_SOURCES].sort()).toEqual(Object.keys(vocabulary.sources).sort());
    expect([...CUT_ROLE_SIGNALS].sort()).toEqual(Object.keys(vocabulary.signals).sort());
  });

  it('refers only to declared positions, signals and sources', () => {
    for (const [name, role] of Object.entries(vocabulary.roles)) {
      expect(vocabulary.positions, name).toHaveProperty(role.position);
      for (const signal of role.signals) expect(vocabulary.signals, name).toHaveProperty(signal);
    }
    for (const [name, signal] of Object.entries(vocabulary.signals)) {
      expect(vocabulary.sources, name).toHaveProperty(signal.source);
    }
  });

  it('keeps the default role signal-free and placeable in the middle', () => {
    expect(DEFAULT_CUT_ROLE).toBe(vocabulary.default);
    expect(vocabulary.roles[DEFAULT_CUT_ROLE]).toMatchObject({ position: 'any', signals: [] });
    for (const [name, role] of Object.entries(vocabulary.roles)) {
      if (name !== DEFAULT_CUT_ROLE) expect(role.signals.length, name).toBeGreaterThan(0);
    }
  });

  it('recognises only roles in the file', () => {
    expect(isCutRole('hook')).toBe(true);
    expect(isCutRole('intro')).toBe(false);
    expect(isCutRole(undefined)).toBe(false);
  });
});

describe('cutRolesAllowedAt', () => {
  it('fills the first and last place with their own role only', () => {
    expect(cutRolesAllowedAt(0, 5)).toEqual(['hook']);
    expect(cutRolesAllowedAt(4, 5)).toEqual(['closer']);
  });

  it('lets the first place win when there is one cut', () => {
    expect(cutRolesAllowedAt(0, 1)).toEqual(['hook']);
  });

  it('offers the any-position roles in between', () => {
    expect(cutRolesAllowedAt(2, 5)).toEqual(['establish', 'detail', 'action', 'people', 'body']);
  });

  it('refuses a place outside the cuts', () => {
    expect(() => cutRolesAllowedAt(5, 5)).toThrow(RangeError);
    expect(() => cutRolesAllowedAt(-1, 5)).toThrow(RangeError);
    expect(() => cutRolesAllowedAt(0, 0)).toThrow(RangeError);
  });
});

describe('isCutRoleJudgeable', () => {
  it('drops the roles that only analysis can judge when analysis is off', () => {
    const withoutAnalysis = CUT_ROLES.filter((role) => isCutRoleJudgeable(role, ['capture', 'local']));
    expect(withoutAnalysis).toEqual(['hook', 'action', 'people', 'closer', 'body']);
  });

  it('judges every role with analysis on', () => {
    expect(CUT_ROLES.every((role) => isCutRoleJudgeable(role, ['capture', 'local', 'analysis']))).toBe(true);
  });

  it('can always fall back to the default role', () => {
    expect(isCutRoleJudgeable(DEFAULT_CUT_ROLE, [])).toBe(true);
  });
});
