/**
 * 기동 설정 중 서버마다 갈리는 값 — S3 자격증명과 믿을 앞단 프록시.
 *
 * 개발·사내 서버는 MinIO 를 키로 쓰고, AWS 서버는 키 없이 인스턴스 역할로 붙는다. 잘못 섞이면
 * 기동은 되는데 첫 업로드에서야 실패하므로, 기동 시점에 어떻게 판정하는지 고정한다.
 * DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

const touched = new Map<string, string | undefined>();

/** 이 테스트에서만 값을 바꾼다. 빈 문자열은 compose 가 ""로 덮은 경우와 같다. */
function setEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!touched.has(key)) {
      touched.set(key, process.env[key]);
    }
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of touched) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  touched.clear();
});

describe('S3 자격증명', () => {
  it('AWS 서버 — 엔드포인트와 키가 비면 정적 키 없이 기본 체인을 쓴다', () => {
    setEnv({
      S3_ENDPOINT: '',
      S3_PUBLIC_ENDPOINT: '',
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
    });
    const { storage } = loadConfig();
    expect(storage.credentials).toBeUndefined();
    expect(storage.endpoint).toBeUndefined();
    expect(storage.forcePathStyle).toBe(false);
  });

  it('MinIO — 키가 있으면 그 키를 쓴다', () => {
    setEnv({
      S3_ENDPOINT: 'http://localhost:9100',
      AWS_ACCESS_KEY_ID: 'minioadmin',
      AWS_SECRET_ACCESS_KEY: 'minioadmin123',
    });
    expect(loadConfig().storage.credentials).toEqual({
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin123',
    });
  });

  it('MinIO 인데 키가 없으면 기동을 거부한다', () => {
    setEnv({
      S3_ENDPOINT: 'http://localhost:9100',
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
    });
    expect(() => loadConfig()).toThrow(/S3_ENDPOINT/);
  });

  it('키가 한쪽만 있으면 기동을 거부한다', () => {
    setEnv({ S3_ENDPOINT: '', AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE', AWS_SECRET_ACCESS_KEY: '' });
    expect(() => loadConfig()).toThrow(/둘 다/);
  });
});

describe('TRUST_PROXY', () => {
  it('없거나 비면 아무 프록시도 믿지 않는다', () => {
    setEnv({ TRUST_PROXY: '' });
    expect(loadConfig().trustProxy).toEqual([]);
  });

  it('쉼표로 구분한 주소·CIDR·프리셋을 받는다', () => {
    setEnv({ TRUST_PROXY: 'uniquelocal, 10.20.0.0/16,::1' });
    expect(loadConfig().trustProxy).toEqual(['uniquelocal', '10.20.0.0/16', '::1']);
  });

  // 홉 수는 Fastify 가 아무것도 믿지 않는 것으로 처리하고, true 는 누구든 믿는다 — 둘 다 조용히 틀린다.
  it.each(['1', 'true'])('홉 수나 true(%s)는 기동을 거부한다', (value) => {
    setEnv({ TRUST_PROXY: value });
    expect(() => loadConfig()).toThrow(/TRUST_PROXY/);
  });
});
