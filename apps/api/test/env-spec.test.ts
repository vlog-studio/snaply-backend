/**
 * 환경변수 목록의 정합성을 고정한다.
 *
 * 세 곳이 어긋나면 아무도 모른 채 배포가 성공하고, 운영에서 주입이 빠진 것으로 드러난다:
 *   - `src/env-spec.ts`  — 단일 원천
 *   - `.env.example`     — 사람이 복사해 쓰는 표현
 *   - 실제 코드          — `process.env.X` / `os.environ.get("X")`
 *
 * 이 테스트는 DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_VARS } from '../src/env-spec.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const SPEC_KEYS: ReadonlySet<string> = new Set<string>(ENV_VARS.map((v) => v.key));

/** `.env.example` 의 키 → 주석 처리(선택 항목) 여부. */
function parseEnvExample(): Map<string, boolean> {
  const text = readFileSync(join(REPO_ROOT, '.env.example'), 'utf-8');
  const keys = new Map<string, boolean>();
  for (const line of text.split('\n')) {
    const match = /^(#?)\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match?.[2]) {
      keys.set(match[2], match[1] === '#');
    }
  }
  return keys;
}

/** 코드가 실제로 읽는 키. 소스를 훑어 정적으로 뽑는다. */
function collectKeysUsedInCode(): Map<string, string> {
  // 테스트 하네스(`test/`)는 제외한다 — TEST_* 는 스펙이 아니라 테스트 설정이다.
  const roots = ['apps/api/src', 'apps/ai-worker/src', 'scripts'];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /requireEnv\(['"]([A-Z][A-Z0-9_]*)['"]\)/g,
    /os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    /os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  ];

  const found = new Map<string, string>();
  for (const root of roots) {
    const dir = join(REPO_ROOT, root);
    for (const entry of readdirSync(dir, { recursive: true, encoding: 'utf-8' })) {
      const path = join(dir, entry);
      if (!/\.(ts|js|mjs|py)$/.test(entry) || !statSync(path).isFile()) {
        continue;
      }
      const text = readFileSync(path, 'utf-8');
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          if (match[1]) {
            found.set(match[1], `${root}/${entry}`);
          }
        }
      }
    }
  }
  return found;
}

describe('환경변수 스펙', () => {
  const example = parseEnvExample();

  it('스펙의 모든 키가 .env.example 에 있다', () => {
    const missing = ENV_VARS.filter((v) => !example.has(v.key)).map((v) => v.key);
    expect(missing, `.env.example 에 추가해야 한다: ${missing.join(', ')}`).toEqual([]);
  });

  it('.env.example 의 모든 키가 스펙에 있다', () => {
    const unknown = [...example.keys()].filter((key) => !SPEC_KEYS.has(key));
    expect(unknown, `src/env-spec.ts 에 추가해야 한다: ${unknown.join(', ')}`).toEqual([]);
  });

  it('기동에 필수인 키는 .env.example 에서 주석 처리되어 있지 않다', () => {
    const commented = ENV_VARS.filter((v) => v.required && example.get(v.key) === true).map(
      (v) => v.key,
    );
    expect(commented, `주석을 풀어야 한다: ${commented.join(', ')}`).toEqual([]);
  });

  it('코드가 읽는 키가 모두 스펙에 선언되어 있다', () => {
    const used = collectKeysUsedInCode();
    const undeclared = [...used.entries()]
      .filter(([key]) => !SPEC_KEYS.has(key))
      .map(([key, where]) => `${key} (${where})`);
    expect(undeclared, `src/env-spec.ts 에 선언해야 한다: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('.env.example 이 빈 값 뒤에 인라인 주석을 달지 않는다', () => {
    // `KEY=   # 설명` 을 docker compose 의 env_file 파서는 "값이 `# 설명`" 으로 읽는다
    // (Node 의 --env-file 은 빈 값으로 읽는다). 같은 파일을 서버·compose·워커가 함께 읽으므로
    // 이 형식이 남아 있으면 컨테이너에만 주석 문자열이 설정값으로 들어간다.
    const text = readFileSync(join(REPO_ROOT, '.env.example'), 'utf-8');
    const offenders = text
      .split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=\s*#/.test(line))
      .map((line) => line.trim());
    expect(offenders, `설명을 줄 위로 옮겨야 한다:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('키가 중복 선언되지 않는다', () => {
    expect(SPEC_KEYS.size).toBe(ENV_VARS.length);
  });
});
