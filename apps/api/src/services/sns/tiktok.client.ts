import { randomBytes } from 'node:crypto';
import type { SnsProviderConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import type { TokenExchangeResult, UploadResult } from './types.js';

/**
 * 요청 스코프. 앱 심사 상태에 따라 쓸 수 있는 게 다르다.
 *
 * - `video.publish` — **직접 게시**. 심사(audit) 통과가 필요하다.
 * - `video.upload`  — **받은함 업로드**. 심사 없이 쓸 수 있지만, 영상이 사용자의 TikTok
 *                     받은함(초안)에 들어가고 **사용자가 앱에서 직접 마무리**해야 게시된다.
 *
 * 심사 전에는 콘솔에 `video.upload` 만 나오므로 그걸로 검증하고, 심사 통과 후
 * TIKTOK_SCOPES 를 바꾸면 직접 게시로 전환된다. 엔드포인트는 스코프에서 자동으로 결정된다.
 */
function scopes(): string {
  return process.env.TIKTOK_SCOPES ?? 'user.info.basic,video.publish';
}

/** 직접 게시(direct post) 모드인지. 아니면 받은함(inbox) 모드. */
function isDirectPost(): boolean {
  return scopes()
    .split(',')
    .map((s) => s.trim())
    .includes('video.publish');
}

/**
 * 틱톡은 실패를 **HTTP 200 + 에러 본문**으로 돌려준다. 그래서 res.ok 만 보면 안 된다.
 * 응답 형태가 두 가지다:
 *   - OAuth:          { error: "invalid_grant", error_description: "..." }
 *   - Content Posting: { data: {...}, error: { code: "ok" | "...", message: "..." } }
 * 둘 다 확인해서 실패면 예외를 던진다. (이걸 안 하면 undefined 토큰을 암호화하려다 500 이 난다.)
 */
function assertTikTokOk(body: unknown, context: string): void {
  const b = (body ?? {}) as { error?: unknown; error_description?: string };

  if (typeof b.error === 'string' && b.error.length > 0) {
    throw AppError.badRequest(`${context} (${b.error}: ${b.error_description ?? ''})`.trim());
  }
  if (b.error !== null && typeof b.error === 'object') {
    const nested = b.error as { code?: string; message?: string };
    if (nested.code && nested.code !== 'ok') {
      throw AppError.badRequest(`${context} (${nested.code}: ${nested.message ?? ''})`.trim());
    }
  }
}

export function authorizeUrl(config: SnsProviderConfig, state: string): string {
  if (config.mock) {
    const params = new URLSearchParams({ state, mock: 'tiktok' });
    return `mock://tiktok/authorize?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_key: config.clientId ?? '',
    redirect_uri: config.redirectUri ?? '',
    scope: scopes(),
    response_type: 'code',
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export async function exchangeCode(
  config: SnsProviderConfig,
  code: string,
): Promise<TokenExchangeResult> {
  if (config.mock) {
    return {
      accessToken: `tt-mock-${randomBytes(8).toString('hex')}`,
      refreshToken: `tt-refresh-${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간
      platformUserId: `tt-user-${randomBytes(4).toString('hex')}`,
      platformUsername: 'mock_tiktok_user',
    };
  }

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: config.clientId ?? '',
      client_secret: config.clientSecret ?? '',
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri ?? '',
      code,
    }),
  });
  const b = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
  };
  assertTikTokOk(b, 'TikTok 토큰 교환에 실패했습니다.');
  if (!b.access_token) {
    throw AppError.badRequest('TikTok 응답에 access_token 이 없습니다.');
  }
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresAt: b.expires_in ? new Date(Date.now() + b.expires_in * 1000) : undefined,
    platformUserId: b.open_id ?? '',
    platformUsername: '',
  };
}

/** access_token(24시간 만료)을 refresh_token으로 갱신. */
export async function refreshAccessToken(
  config: SnsProviderConfig,
  refreshToken: string,
): Promise<TokenExchangeResult> {
  if (config.mock) {
    return {
      accessToken: `tt-mock-${randomBytes(8).toString('hex')}`,
      refreshToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      platformUserId: '',
      platformUsername: '',
    };
  }
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: config.clientId ?? '',
      client_secret: config.clientSecret ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const b = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  assertTikTokOk(b, 'TikTok 토큰 갱신에 실패했습니다.');
  if (!b.access_token) {
    throw AppError.badRequest('TikTok 갱신 응답에 access_token 이 없습니다.');
  }
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresAt: b.expires_in ? new Date(Date.now() + b.expires_in * 1000) : undefined,
    platformUserId: '',
    platformUsername: '',
  };
}

/** 게시 상태 폴링 설정. 호출 시점에 읽는다. */
function pollIntervalMs(): number {
  return Number(process.env.TIKTOK_POLL_INTERVAL_MS ?? 5_000);
}
function pollTimeoutMs(): number {
  return Number(process.env.TIKTOK_POLL_TIMEOUT_MS ?? 2 * 60_000);
}

export async function uploadVideo(
  config: SnsProviderConfig,
  params: { accessToken: string; videoUrl: string; caption: string },
): Promise<UploadResult> {
  if (config.mock) {
    return { postId: `tt-post-${randomBytes(6).toString('hex')}` };
  }
  // Content Posting API v2 (PULL_FROM_URL). 스코프에 따라 엔드포인트가 갈린다.
  //  - 직접 게시: /post/publish/video/init/        (video.publish, 심사 필요)
  //  - 받은함    : /post/publish/inbox/video/init/  (video.upload, 심사 불필요)
  // 받은함 모드에는 post_info(제목·공개범위)를 넣지 않는다 — 사용자가 앱에서 직접 정한다.
  const direct = isDirectPost();
  const endpoint = direct
    ? 'https://open.tiktokapis.com/v2/post/publish/video/init/'
    : 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
  const source_info = { source: 'PULL_FROM_URL', video_url: params.videoUrl };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(
      direct
        ? // ※ 심사를 통과하지 않은 앱은 어떤 privacy_level 을 줘도 비공개로만 게시된다.
          { post_info: { title: params.caption, privacy_level: 'SELF_ONLY' }, source_info }
        : { source_info },
    ),
  });
  if (!res.ok) {
    throw AppError.badRequest(`TikTok 업로드에 실패했습니다. ${await errorDetail(res)}`);
  }
  const body = (await res.json()) as { data?: { publish_id?: string } };
  assertTikTokOk(body, 'TikTok 업로드에 실패했습니다.');
  const publishId = body.data?.publish_id ?? '';
  if (!publishId) {
    throw AppError.badRequest('TikTok 이 publish_id 를 반환하지 않았습니다.');
  }

  // init 은 "접수" 일 뿐이다. 실제 완료까지 확인해야 이력의 status 가 사실과 맞는다.
  const status = await waitForPublish(params.accessToken, publishId);
  // 받은함 모드는 우리 쪽 전달이 끝나도 게시되지 않는다 — 사용자가 앱에서 마무리해야 한다.
  // (직접 게시일 땐 필드를 아예 넣지 않는다 — 응답에 의미 없는 false 를 남기지 않기 위해)
  return { postId: publishId, status, ...(direct ? {} : { requiresUserAction: true }) };
}

/**
 * 게시 완료까지 폴링.
 * 완료 → 'success', 실패 → 예외, 시간 내 미완료 → 'pending'(플랫폼에서 계속 진행 중).
 */
async function waitForPublish(
  accessToken: string,
  publishId: string,
): Promise<'success' | 'pending'> {
  const deadline = Date.now() + pollTimeoutMs();

  while (Date.now() < deadline) {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    if (!res.ok) {
      throw AppError.badRequest(`TikTok 게시 상태 조회에 실패했습니다. ${await errorDetail(res)}`);
    }
    const body = (await res.json()) as {
      data?: { status?: string; fail_reason?: string };
    };
    assertTikTokOk(body, 'TikTok 게시 상태 조회에 실패했습니다.');

    switch (body.data?.status) {
      case 'PUBLISH_COMPLETE':
        return 'success';
      // 심사 전 앱은 사용자 받은함으로 전달되는 경우가 있다 — 우리 쪽 처리는 끝난 것으로 본다.
      case 'SEND_TO_USER_INBOX':
        return 'success';
      case 'FAILED':
        throw AppError.badRequest(
          `TikTok 게시에 실패했습니다. ${body.data.fail_reason ?? ''}`.trim(),
        );
      default:
        // PROCESSING_UPLOAD / PROCESSING_DOWNLOAD 등
        await sleep(pollIntervalMs());
    }
  }

  // 아직 진행 중 — 실패로 단정하지 않는다.
  return 'pending';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** TikTok 에러 본문을 짧게 추출. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return body.error?.message ? `(${res.status}: ${body.error.message})` : `(${res.status})`;
  } catch {
    return `(${res.status})`;
  }
}
