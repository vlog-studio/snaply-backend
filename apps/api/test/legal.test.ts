/**
 * 플랫폼 콘솔이 요구하는 공개 페이지 + URL 소유권 검증.
 *
 * 틱톡은 약관/개인정보 URL 을 "verified" 상태로 만들라고 요구한다. 개발 터널 도메인은
 * 우리 소유가 아니라 DNS TXT 방식을 쓸 수 없어, 파일 서빙 / 메타 태그 두 방식만 가능하다.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createHarness, type Harness } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
afterEach(() => {
  delete process.env.SITE_VERIFICATION_META;
  delete process.env.SITE_VERIFICATION_FILE_NAME;
  delete process.env.SITE_VERIFICATION_FILE_CONTENT;
});

describe('공개 페이지', () => {
  it.each([
    ['/', '숏폼'],
    ['/legal/terms', '이용약관'],
    ['/legal/privacy', '개인정보'],
  ])('%s 가 HTML 을 반환한다', async (path, expected) => {
    const res = await h.app.inject({ method: 'GET', url: path });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain(expected);
  });

  it('법률 문서는 초안임을 페이지에 명시한다', async () => {
    for (const path of ['/legal/terms', '/legal/privacy']) {
      const res = await h.app.inject({ method: 'GET', url: path });
      expect(res.body).toContain('출시 전 초안');
    }
  });

  it('개인정보처리방침이 실제 처리 내용을 담는다', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/legal/privacy' });
    // 코드 동작과 어긋나면 안 되는 핵심 문구
    expect(res.body).toContain('위치 정보는');
    expect(res.body).toContain('저장하지 않습니다');
    expect(res.body).toContain('AES-256-GCM');
  });
});

describe('URL 소유권 검증 — 메타 태그 방식', () => {
  it('미설정이면 메타 태그가 없다', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/legal/terms' });
    expect(res.body).not.toContain('site-verification');
  });

  it('설정하면 약관·개인정보·소개 페이지 모두에 삽입된다', async () => {
    process.env.SITE_VERIFICATION_META = 'tiktok-developers-site-verification=abc123xyz';

    for (const path of ['/', '/legal/terms', '/legal/privacy']) {
      const res = await h.app.inject({ method: 'GET', url: path });
      expect(res.body).toContain(
        '<meta name="tiktok-developers-site-verification" content="abc123xyz">',
      );
    }
  });

  it('여러 개를 콤마로 넣을 수 있다', async () => {
    process.env.SITE_VERIFICATION_META = 'tiktok-x=aaa, facebook-domain-verification=bbb';
    const res = await h.app.inject({ method: 'GET', url: '/legal/terms' });
    expect(res.body).toContain('<meta name="tiktok-x" content="aaa">');
    expect(res.body).toContain('<meta name="facebook-domain-verification" content="bbb">');
  });

  it('값에 따옴표가 있어도 속성을 깨뜨리지 않는다', async () => {
    process.env.SITE_VERIFICATION_META = 'x="><script>alert(1)</script>';
    const res = await h.app.inject({ method: 'GET', url: '/legal/terms' });
    expect(res.body).not.toContain('<script>alert(1)</script>');
    expect(res.body).toContain('&quot;');
  });
});

describe('URL 소유권 검증 — 파일 방식', () => {
  it('미설정이면 404', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/tiktokAbc123.txt' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('설정한 파일명이면 평문으로 내용을 반환한다', async () => {
    process.env.SITE_VERIFICATION_FILE_NAME = 'tiktokAbc123.txt';
    process.env.SITE_VERIFICATION_FILE_CONTENT = 'tiktok-developers-site-verification=abc123';

    const res = await h.app.inject({ method: 'GET', url: '/tiktokAbc123.txt' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toBe('tiktok-developers-site-verification=abc123');
  });

  it('URL prefix 검증용으로 /legal/ 아래에서도 서빙한다', async () => {
    process.env.SITE_VERIFICATION_FILE_NAME = 'tiktokAbc123.txt';
    process.env.SITE_VERIFICATION_FILE_CONTENT = 'prefix-ok';

    // domain 검증(루트) / URL prefix 검증(/legal/) 둘 다 대응해야 한다
    for (const url of ['/tiktokAbc123.txt', '/legal/tiktokAbc123.txt']) {
      const res = await h.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toBe('prefix-ok');
    }
  });

  it('/legal/ 아래 검증 파일이 약관·개인정보 페이지를 가리지 않는다', async () => {
    process.env.SITE_VERIFICATION_FILE_NAME = 'terms'; // 일부러 충돌
    process.env.SITE_VERIFICATION_FILE_CONTENT = 'should-not-win';

    const res = await h.app.inject({ method: 'GET', url: '/legal/terms' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('이용약관');
  });

  it('다른 파일명은 404 (설정된 것만 응답)', async () => {
    process.env.SITE_VERIFICATION_FILE_NAME = 'tiktokAbc123.txt';
    process.env.SITE_VERIFICATION_FILE_CONTENT = 'x';

    const res = await h.app.inject({ method: 'GET', url: '/tiktokOTHER.txt' });
    expect(res.statusCode).toBe(404);
  });
});

describe('검증 라우트가 기존 경로를 가리지 않는다', () => {
  // '/:filename' 파라미터 라우트가 루트 단일 세그먼트를 잡으므로 회귀 위험이 있다.
  it('설정이 있어도 /health 는 정상 동작한다', async () => {
    process.env.SITE_VERIFICATION_FILE_NAME = 'health'; // 일부러 충돌시켜 본다
    process.env.SITE_VERIFICATION_FILE_CONTENT = 'should-not-win';

    const res = await h.app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('ok');
  });

  it('인증이 필요한 경로는 그대로 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('없는 다중 세그먼트 경로는 공통 404 포맷', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/nope/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
