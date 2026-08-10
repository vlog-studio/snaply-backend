/**
 * Phase 7 — 실키 모드(mock=false)에서만 드러나는 경로.
 *
 * 인스타/틱톡 앱 등록·심사가 끝나기 전에도 "키가 있으면 어떤 요청을 보내는지"는 고정해둘 수 있다.
 * 외부 호출은 fetch 스텁으로 가로채고, 우리 쪽 순서/분기만 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createHarness, type Harness } from './helpers/harness.js';
import { encrypt } from '../src/lib/crypto.js';
import * as instagram from '../src/services/sns/instagram.client.js';
import * as tiktok from '../src/services/sns/tiktok.client.js';
import type { SnsProviderConfig } from '../src/config.js';

let h: Harness;

const REAL_KEYS = {
  INSTAGRAM_APP_ID: 'test-ig-app',
  INSTAGRAM_APP_SECRET: 'test-ig-secret',
  INSTAGRAM_REDIRECT_URI: 'https://api.snaply.test/sns/instagram/callback',
  TIKTOK_CLIENT_KEY: 'test-tt-key',
  TIKTOK_CLIENT_SECRET: 'test-tt-secret',
  TIKTOK_REDIRECT_URI: 'https://api.snaply.test/sns/tiktok/callback',
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: 'verify-token-for-test',
};

const igConfig: SnsProviderConfig = {
  clientId: REAL_KEYS.INSTAGRAM_APP_ID,
  clientSecret: REAL_KEYS.INSTAGRAM_APP_SECRET,
  redirectUri: REAL_KEYS.INSTAGRAM_REDIRECT_URI,
  mock: false,
};

const ttConfig: SnsProviderConfig = {
  clientId: REAL_KEYS.TIKTOK_CLIENT_KEY,
  clientSecret: REAL_KEYS.TIKTOK_CLIENT_SECRET,
  redirectUri: REAL_KEYS.TIKTOK_REDIRECT_URI,
  mock: false,
};

const ttUploadParams = {
  accessToken: 'tok',
  videoUrl: 'https://cdn.example.com/v.mp4',
  caption: '테스트',
};

beforeAll(async () => {
  h = await createHarness(REAL_KEYS);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── fetch 스텁 ─────────────────────────────────────────
type Handler = (
  url: string,
  init?: RequestInit,
) => { status?: number; body?: unknown; raw?: string } | undefined;

/** graph/instagram 호출만 가로채고 나머지(JWKS 등)는 실제 fetch로 흘려보낸다. */
function stubFetch(handler: Handler): { calls: string[] } {
  const calls: string[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const matched = handler(url, init);
    if (!matched) {
      return real(input as RequestInfo, init);
    }
    calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`);
    const status = matched.status ?? 200;
    // raw 를 주면 그대로 내려보낸다 — JSON.stringify 를 거치면 큰 정수의 정밀도가 깨져서
    // 정밀도 회귀 테스트를 할 수 없다.
    const payload = matched.raw ?? JSON.stringify(matched.body);
    return new Response(payload, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { calls };
}

describe('authorize URL (실키 모드)', () => {
  it('인스타그램은 Instagram Login 엔드포인트와 게시 스코프를 쓴다', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/instagram/connect',
      headers: user.auth,
    });

    const url = new URL(res.json().data.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_content_publish',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(REAL_KEYS.INSTAGRAM_APP_ID);
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('틱톡은 video.publish 스코프를 요청한다', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/tiktok/connect',
      headers: user.auth,
    });

    const url = new URL(res.json().data.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('scope')).toContain('video.publish');
  });
});

describe('공개 URL 가드', () => {
  async function connectDirectly(userId: string, platform: 'instagram' | 'tiktok') {
    await h.prisma.snsConnection.create({
      data: {
        userId,
        platform,
        platformUserId: 'ig-123',
        platformUsername: 'tester',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async function uploadWith(editedUrl: string) {
    const user = await h.createUser();
    await connectDirectly(user.id, 'instagram');
    const video = await h.prisma.video.create({
      data: { userId: user.id, originalUrls: [], editedUrl, status: 'completed' },
      select: { id: true },
    });
    return h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });
  }

  it('로컬 MinIO 주소면 외부 호출 전에 400 으로 막는다', async () => {
    const res = await uploadWith('http://localhost:9100/snaply-dev/edited/a.mp4');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('접근할 수 없는 주소');
  });

  it('사설 IP도 막는다', async () => {
    const res = await uploadWith('https://192.168.0.10/v.mp4');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('접근할 수 없는 주소');
  });

  it('http 는 거부한다 (플랫폼이 https 를 요구)', async () => {
    const res = await uploadWith('http://cdn.example.com/v.mp4');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('https');
  });

  it('실패도 sns_uploads 에 기록되지 않는다 (호출 전 차단)', async () => {
    await uploadWith('http://localhost:9100/v.mp4');
    expect(await h.prisma.snsUpload.count()).toBe(0);
  });
});

describe('인스타그램 릴스 게시 — 컨테이너 처리 대기', () => {
  it('FINISHED 가 된 뒤에만 media_publish 를 호출한다', async () => {
    let statusCalls = 0;
    const { calls } = stubFetch((url) => {
      if (url.includes('/media_publish')) return { body: { id: 'ig-post-999' } };
      if (url.includes('/media')) return { body: { id: 'container-1' } };
      if (url.includes('container-1')) {
        statusCalls += 1;
        // 앞의 두 번은 아직 처리 중
        return { body: { status_code: statusCalls >= 3 ? 'FINISHED' : 'IN_PROGRESS' } };
      }
      return undefined;
    });

    const result = await instagram.uploadReel(igConfig, {
      accessToken: 'tok',
      videoUrl: 'https://cdn.example.com/v.mp4',
      caption: '테스트',
    });

    expect(result.postId).toBe('ig-post-999');
    expect(statusCalls).toBe(3);
    // 순서: 컨테이너 생성 → 상태조회 3회 → 게시
    expect(calls[0]).toContain('POST');
    expect(calls[0]).toContain('/media');
    expect(calls.at(-1)).toContain('/media_publish');
    expect(calls.filter((c) => c.includes('/media_publish'))).toHaveLength(1);
  });

  it('컨테이너가 ERROR 면 게시하지 않고 실패시킨다', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('/media_publish')) return { body: { id: 'should-not-happen' } };
      if (url.includes('/media')) return { body: { id: 'container-2' } };
      if (url.includes('container-2')) return { body: { status_code: 'ERROR', status: 'bad codec' } };
      return undefined;
    });

    await expect(
      instagram.uploadReel(igConfig, {
        accessToken: 'tok',
        videoUrl: 'https://cdn.example.com/v.mp4',
        caption: '',
      }),
    ).rejects.toThrow(/영상 처리에 실패/);

    expect(calls.some((c) => c.includes('/media_publish'))).toBe(false);
  });

  it('처리 시간이 초과되면 타임아웃으로 실패한다', async () => {
    stubFetch((url) => {
      if (url.includes('/media')) return { body: { id: 'container-3' } };
      if (url.includes('container-3')) return { body: { status_code: 'IN_PROGRESS' } };
      return undefined;
    });

    await expect(
      instagram.uploadReel(igConfig, {
        accessToken: 'tok',
        videoUrl: 'https://cdn.example.com/v.mp4',
        caption: '',
      }),
    ).rejects.toThrow(/시간 내에 끝나지 않았습니다/);
  });
});

describe('틱톡 게시 결과 확인', () => {
  it('PUBLISH_COMPLETE 가 될 때까지 상태를 폴링한다', async () => {
    let statusCalls = 0;
    const { calls } = stubFetch((url) => {
      if (url.includes('/publish/video/init/')) {
        return { body: { data: { publish_id: 'pub-1' } } };
      }
      if (url.includes('/publish/status/fetch/')) {
        statusCalls += 1;
        return {
          body: { data: { status: statusCalls >= 3 ? 'PUBLISH_COMPLETE' : 'PROCESSING_DOWNLOAD' } },
        };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);

    expect(result).toEqual({ postId: 'pub-1', status: 'success' });
    expect(statusCalls).toBe(3);
    expect(calls[0]).toContain('/publish/video/init/');
  });

  it('받은함으로 전달되면(SEND_TO_USER_INBOX) 성공으로 본다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-2' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'SEND_TO_USER_INBOX' } } };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);
    expect(result.status).toBe('success');
  });

  it('FAILED 면 사유를 담아 실패시킨다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-3' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'FAILED', fail_reason: 'video_format_unsupported' } } };
      }
      return undefined;
    });

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(
      /video_format_unsupported/,
    );
  });

  it('시간 내에 안 끝나면 실패가 아니라 pending 이다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-4' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'PROCESSING_DOWNLOAD' } } };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);
    expect(result).toEqual({ postId: 'pub-4', status: 'pending' });
  });

  it('publish_id 가 없으면 실패로 처리한다', async () => {
    stubFetch((url) => (url.includes('/publish/video/init/') ? { body: { data: {} } } : undefined));

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(/publish_id/);
  });

  it('pending 이면 sns_uploads 에 pending 으로 남고 uploadedAt 은 비어 있다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'tiktok',
        platformUserId: 'tt-1',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-5' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'PROCESSING_UPLOAD' } } };
      }
      return undefined;
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'pending', platformPostId: 'pub-5' });
    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.status).toBe('pending');
    expect(upload.uploadedAt).toBeNull();
  });
});

describe('업로드 실패 사유 기록', () => {
  // 플랫폼 에러는 원인이 응답 본문에만 있다. 저장하지 않으면 사후 추적이 불가능하다.
  it('실패 시 sns_uploads 에 플랫폼이 준 사유를 남긴다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'tiktok',
        platformUserId: 'tt-1',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });
    stubFetch((url) =>
      url.includes('/publish/inbox/video/init/') || url.includes('/publish/video/init/')
        ? {
            status: 403,
            body: { error: { code: 'url_ownership_unverified', message: 'verify your URL prefix' } },
          }
        : undefined,
    );

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(400);
    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.status).toBe('failed');
    expect(upload.errorMessage).toContain('verify your URL prefix');
  });

  it('사유가 아주 길어도 컬럼 길이를 넘기지 않는다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'tiktok',
        platformUserId: 'tt-2',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });
    stubFetch((url) =>
      url.includes('/video/init/')
        ? { status: 500, body: { error: { code: 'oops', message: 'x'.repeat(3000) } } }
        : undefined,
    );

    await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.errorMessage!.length).toBeLessThanOrEqual(500);
  });
});

describe('틱톡은 실패를 HTTP 200 + 에러 본문으로 준다', () => {
  // 실측: 만료된 code 로 토큰 교환 시 200 { error: "invalid_grant", ... } 가 온다.
  // res.ok 만 보면 undefined 토큰을 암호화하려다 500(ERR_INVALID_ARG_TYPE)이 났다.
  it('토큰 교환 실패를 400 으로 처리한다 (크래시 아님)', async () => {
    stubFetch((url) =>
      url.includes('/oauth/token/')
        ? {
            status: 200,
            body: { error: 'invalid_grant', error_description: 'Authorization code is expired.' },
          }
        : undefined,
    );

    await expect(tiktok.exchangeCode(ttConfig, 'expired-code')).rejects.toThrow(/invalid_grant/);
  });

  it('토큰 갱신 실패도 같은 방식으로 처리한다', async () => {
    stubFetch((url) =>
      url.includes('/oauth/token/')
        ? { status: 200, body: { error: 'invalid_request', error_description: 'bad refresh' } }
        : undefined,
    );

    await expect(tiktok.refreshAccessToken(ttConfig, 'stale')).rejects.toThrow(/invalid_request/);
  });

  it('access_token 이 없으면 명확한 에러를 낸다', async () => {
    stubFetch((url) => (url.includes('/oauth/token/') ? { status: 200, body: {} } : undefined));

    await expect(tiktok.exchangeCode(ttConfig, 'code')).rejects.toThrow(/access_token/);
  });

  it('Content Posting API 의 error.code 가 ok 가 아니면 실패로 본다', async () => {
    stubFetch((url) =>
      url.includes('/publish/video/init/')
        ? {
            status: 200,
            body: {
              data: {},
              error: { code: 'spam_risk_too_many_posts', message: 'daily limit reached' },
            },
          }
        : undefined,
    );

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(/spam_risk/);
  });

  it('게시 상태 조회의 에러도 잡는다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'p1' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { status: 200, body: { error: { code: 'access_token_invalid', message: 'expired' } } };
      }
      return undefined;
    });

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(
      /access_token_invalid/,
    );
  });
});

describe('OAuth 콜백은 항상 앱으로 돌려보낸다', () => {
  // 콜백은 사용자 브라우저가 도착하는 지점이라, JSON 에러를 주면 앱으로 복귀할 방법이 없다.
  it('토큰 교환이 실패해도 JSON 이 아니라 에러 딥링크로 302', async () => {
    const user = await h.createUser();
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { status: 400, body: { error_type: 'OAuthException', error_message: 'Invalid code' } };
      }
      return undefined;
    });
    const { encodeState } = await import('../src/lib/crypto.js');

    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/callback?code=bad&state=${encodeURIComponent(encodeState(user.id))}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('snaply://sns/error?platform=instagram&reason=exchange_failed');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });

  it('틱톡 200-에러 응답에서도 딥링크로 302 (500 아님)', async () => {
    const user = await h.createUser();
    stubFetch((url) =>
      url.includes('/oauth/token/')
        ? { status: 200, body: { error: 'invalid_grant', error_description: 'expired' } }
        : undefined,
    );
    const { encodeState } = await import('../src/lib/crypto.js');

    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/tiktok/callback?code=bad&state=${encodeURIComponent(encodeState(user.id))}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('snaply://sns/error?platform=tiktok&reason=exchange_failed');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });
});

describe('user_id 정밀도 (2^53 초과)', () => {
  // 실측: Instagram user_id 는 27899354646370752 처럼 2^53 을 넘고 JSON **숫자**로 온다.
  // JSON.parse 하면 ...750 으로 값이 바뀌고, 그 ID 로 게시를 시도하면 Meta 가
  // "Object with ID ... does not exist" 로 거부한다 (실제로 확인됨).
  const BIG_ID = '27899354646370752';

  it('JSON 숫자로 온 user_id 를 정확한 문자열로 보존한다', async () => {
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        // 따옴표 없는 큰 정수 — 실제 Meta 응답과 동일한 형태
        return { raw: `{"access_token":"short","user_id":${BIG_ID},"permissions":"a,b"}` };
      }
      // 장기 교환·프로필 조회를 실패시켜 폴백 경로를 태운다
      if (url.includes('graph.instagram.com/access_token')) return { status: 400, body: {} };
      if (url.includes('/me')) return { status: 400, body: {} };
      return undefined;
    });

    const result = await instagram.exchangeCode(igConfig, 'code');

    expect(result.platformUserId).toBe(BIG_ID);
    // 정밀도가 깨졌다면 ...750 이 된다
    expect(result.platformUserId).not.toBe('27899354646370750');
  });

  it('/me 가 성공하면 그 값(문자열)을 쓴다', async () => {
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { raw: `{"access_token":"short","user_id":${BIG_ID}}` };
      }
      if (url.includes('graph.instagram.com/access_token')) {
        return { body: { access_token: 'long-lived', expires_in: 5_184_000 } };
      }
      if (url.includes('/me')) {
        return {
          body: { user_id: '17841439086162200', username: 'gagejigi', account_type: 'BUSINESS' },
        };
      }
      return undefined;
    });

    const result = await instagram.exchangeCode(igConfig, 'code');

    expect(result.platformUserId).toBe('17841439086162200');
    expect(result.accountType).toBe('BUSINESS');
    expect(result.accessToken).toBe('long-lived');
  });

  it('게시는 계정 ID 대신 /me 경로를 쓴다 (ID 불일치 위험 제거)', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('/media_publish')) return { body: { id: 'post-1' } };
      if (url.includes('/media')) return { body: { id: 'c1' } };
      if (url.includes('c1')) return { body: { status_code: 'FINISHED' } };
      return undefined;
    });

    await instagram.uploadReel(igConfig, {
      accessToken: 'tok',
      videoUrl: 'https://cdn.example.com/v.mp4',
      caption: '',
    });

    expect(calls.some((c) => c.includes('/me/media'))).toBe(true);
    expect(calls.some((c) => c.includes('/me/media_publish'))).toBe(true);
  });
});

describe('틱톡 스코프에 따른 게시 방식 전환', () => {
  // video.publish 는 앱 심사 통과가 필요하다. 심사 전에는 video.upload(받은함)만 쓸 수 있고,
  // 이때는 영상이 사용자 초안함에 들어가 사용자가 앱에서 마무리해야 게시된다.
  const originalScopes = process.env.TIKTOK_SCOPES;
  afterEach(() => {
    if (originalScopes === undefined) delete process.env.TIKTOK_SCOPES;
    else process.env.TIKTOK_SCOPES = originalScopes;
  });

  function stubPublishFlow() {
    return stubFetch((url) => {
      if (url.includes('/video/init/')) return { body: { data: { publish_id: 'p1' } } };
      if (url.includes('/status/fetch/')) {
        return { body: { data: { status: 'PUBLISH_COMPLETE' } } };
      }
      return undefined;
    });
  }

  it('video.publish 면 직접 게시 엔드포인트를 쓰고 post_info 를 보낸다', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,video.publish';
    let sentBody = '';
    stubFetch((url, init) => {
      if (url.includes('/post/publish/video/init/')) {
        sentBody = String(init?.body ?? '');
        return { body: { data: { publish_id: 'p1' } } };
      }
      if (url.includes('/status/fetch/')) return { body: { data: { status: 'PUBLISH_COMPLETE' } } };
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);

    expect(sentBody).toContain('post_info');
    expect(sentBody).toContain('SELF_ONLY');
    expect(result.requiresUserAction).toBeFalsy();
    expect(result.status).toBe('success');
  });

  it('video.upload 면 받은함 엔드포인트를 쓰고 post_info 를 보내지 않는다', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,video.upload';
    let sentUrl = '';
    let sentBody = '';
    stubFetch((url, init) => {
      if (url.includes('/video/init/')) {
        sentUrl = url;
        sentBody = String(init?.body ?? '');
        return { body: { data: { publish_id: 'p2' } } };
      }
      if (url.includes('/status/fetch/')) {
        return { body: { data: { status: 'SEND_TO_USER_INBOX' } } };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);

    expect(sentUrl).toContain('/post/publish/inbox/video/init/');
    // 제목·공개범위는 사용자가 틱톡 앱에서 직접 정한다
    expect(sentBody).not.toContain('post_info');
    expect(sentBody).toContain('PULL_FROM_URL');
    // 우리 전달은 끝났지만 게시는 사용자가 마무리해야 한다
    expect(result.requiresUserAction).toBe(true);
    expect(result.status).toBe('success');
  });

  it('authorize URL 이 설정된 스코프를 그대로 요청한다', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,video.upload';
    const url = new URL(tiktok.authorizeUrl(ttConfig, 'state-x'));
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.upload');
  });

  it('기본값은 직접 게시(video.publish)다', async () => {
    delete process.env.TIKTOK_SCOPES;
    const url = new URL(tiktok.authorizeUrl(ttConfig, 'state-x'));
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
    stubPublishFlow();
    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);
    expect(result.requiresUserAction).toBeFalsy();
  });
});

describe('인스타그램 웹훅 (콘솔 등록용 검증)', () => {
  const VERIFY_TOKEN = REAL_KEYS.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  it('mode=subscribe + 올바른 인증 토큰이면 challenge 를 평문으로 되돌려준다', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('1158201444');
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('인증 토큰이 다르면 403', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/instagram/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1',
    });
    expect(res.statusCode).toBe(403);
  });

  it('mode 가 subscribe 가 아니면 403', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/webhook?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('이벤트 POST 는 서명이 맞으면 200', async () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] });
    const signature = `sha256=${createHmac('sha256', REAL_KEYS.INSTAGRAM_APP_SECRET)
      .update(body)
      .digest('hex')}`;

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
  });

  it('이벤트 POST 서명이 틀리면 401', async () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('인스타그램 토큰 교환', () => {
  it('단기 → 장기 토큰 교환 후 프로필에서 account_type 을 실제로 읽는다', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { body: { access_token: 'short-lived', user_id: 12345 } };
      }
      if (url.includes('graph.instagram.com/access_token')) {
        return { body: { access_token: 'long-lived', expires_in: 5_184_000 } };
      }
      if (url.includes('/me')) {
        return { body: { user_id: '12345', username: 'real_user', account_type: 'CREATOR' } };
      }
      return undefined;
    });

    const result = await instagram.exchangeCode(igConfig, 'auth-code');

    expect(result.accessToken).toBe('long-lived');
    expect(result.platformUsername).toBe('real_user');
    expect(result.accountType).toBe('CREATOR');
    // 60일 뒤 만료
    const days = (result.expiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(59);
    expect(calls).toHaveLength(3);
  });

  it('PERSONAL 계정은 콜백에서 걸러진다', async () => {
    const user = await h.createUser();
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { body: { access_token: 'short', user_id: 1 } };
      }
      if (url.includes('graph.instagram.com/access_token')) {
        return { body: { access_token: 'long', expires_in: 5_184_000 } };
      }
      if (url.includes('/me')) {
        return { body: { user_id: '1', username: 'personal_user', account_type: 'PERSONAL' } };
      }
      return undefined;
    });

    const { encodeState } = await import('../src/lib/crypto.js');
    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/callback?code=c&state=${encodeURIComponent(encodeState(user.id))}`,
    });

    expect(res.headers.location).toContain('reason=account_type');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });
});

describe('토큰 만료 처리', () => {
  it('이미 만료된 연동으로 업로드하면 재연동을 안내한다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'instagram',
        platformUserId: 'ig-1',
        accessToken: encrypt('expired-token'),
        tokenExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('다시 연동');
  });

  it('만료가 7일 이내로 다가오면 업로드 전에 장기 토큰을 갱신한다', async () => {
    const user = await h.createUser();
    const conn = await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'instagram',
        platformUserId: 'ig-1',
        accessToken: encrypt('old-long-lived'),
        tokenExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3일 뒤
      },
      select: { id: true, accessToken: true },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });

    stubFetch((url) => {
      if (url.includes('refresh_access_token')) {
        return { body: { access_token: 'refreshed-token', expires_in: 5_184_000 } };
      }
      if (url.includes('/media_publish')) return { body: { id: 'ig-post-1' } };
      if (url.includes('/media')) return { body: { id: 'c1' } };
      if (url.includes('c1')) return { body: { status_code: 'FINISHED' } };
      return undefined;
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(200);
    const after = await h.prisma.snsConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(after.accessToken).not.toBe(conn.accessToken);
    const daysLeft = (after.tokenExpiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(59);
  });
});
