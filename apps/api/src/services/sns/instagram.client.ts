/**
 * Instagram 릴스 게시 클라이언트 — "Instagram API with Instagram Login" 기준.
 *
 * 이 계열을 고른 이유: 페이스북 페이지 연결 없이 인스타 프로페셔널 계정만으로 게시할 수 있어
 * 모바일 앱에 붙이기 쉽다. (구 Basic Display API 는 2024-12 종료됐고 게시 기능도 없었다.)
 *
 * 토큰 수명: 단기(1시간) → 장기(60일) 교환. 장기 토큰은 만료 전에 refresh 해야 한다.
 * 게시 흐름: 컨테이너 생성 → status_code 가 FINISHED 가 될 때까지 폴링 → 게시.
 *   컨테이너는 즉시 준비되지 않으므로 폴링 없이 media_publish 를 호출하면 실패한다.
 */
import { randomBytes } from 'node:crypto';
import type { SnsProviderConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import type { SnsLogger, TokenExchangeResult, UploadResult } from './types.js';

const SCOPE = 'instagram_business_basic,instagram_business_content_publish';
const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION ?? 'v23.0';
const GRAPH_HOST = 'https://graph.instagram.com';

/** 컨테이너 처리 대기 설정. Meta 권장은 "1분 간격, 최대 5분". 호출 시점에 읽는다. */
function pollIntervalMs(): number {
  return Number(process.env.INSTAGRAM_POLL_INTERVAL_MS ?? 10_000);
}
function pollTimeoutMs(): number {
  return Number(process.env.INSTAGRAM_POLL_TIMEOUT_MS ?? 5 * 60_000);
}

export function authorizeUrl(config: SnsProviderConfig, state: string): string {
  if (config.mock) {
    // 개발(mock): 콜백을 바로 호출할 수 있도록 안내용 URL 반환
    const params = new URLSearchParams({ state, mock: 'instagram' });
    return `mock://instagram/authorize?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: config.clientId ?? '',
    redirect_uri: config.redirectUri ?? '',
    scope: SCOPE,
    response_type: 'code',
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

interface ShortLivedToken {
  access_token?: string;
  user_id?: string | number;
  permissions?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * 토큰 응답의 `user_id` 를 **문자열로** 뽑아낸다.
 *
 * 이유: Instagram 의 user_id 는 `27899354646370752` 처럼 2^53 을 넘고, 응답에서 JSON **숫자**로 온다.
 * 그대로 `JSON.parse` 하면 `27899354646370750` 으로 값이 바뀐다(부동소수점 정밀도 손실).
 * 이 값을 게시 URL 경로에 쓰면 Meta 가 "Object with ID ... does not exist" 로 거부한다 — 실측 확인됨.
 */
function extractUserId(rawJson: string): string | undefined {
  const match = /"user_id"\s*:\s*"?(\d+)"?/.exec(rawJson);
  return match?.[1];
}

interface LongLivedToken {
  access_token: string;
  expires_in: number;
}

interface IgProfile {
  user_id?: string;
  username?: string;
  account_type?: string;
}

/** code → 단기 토큰 → 장기 토큰(60일) → 프로필 조회까지 한 번에 처리한다. */
export async function exchangeCode(
  config: SnsProviderConfig,
  code: string,
  logger?: SnsLogger,
): Promise<TokenExchangeResult> {
  if (config.mock) {
    // code='mock-personal' 이면 일반 계정으로 시뮬레이션(릴스 업로드 불가 경로 검증용)
    const accountType = code === 'mock-personal' ? 'PERSONAL' : 'BUSINESS';
    return {
      accessToken: `ig-mock-${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60일(장기 토큰)
      platformUserId: `ig-user-${randomBytes(4).toString('hex')}`,
      platformUsername: 'mock_instagram_user',
      accountType,
    };
  }

  // 1) code → 단기 토큰 (1시간)
  const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId ?? '',
      client_secret: config.clientSecret ?? '',
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri ?? '',
      code,
    }),
  });
  if (!shortRes.ok) {
    throw AppError.badRequest(`Instagram 토큰 교환에 실패했습니다. ${await errorDetail(shortRes)}`);
  }
  // user_id 정밀도 손실을 피하려고 원문 텍스트를 먼저 확보한다.
  const shortRaw = await shortRes.text();
  const short = JSON.parse(shortRaw) as ShortLivedToken;
  const shortUserId = extractUserId(shortRaw);
  if (!short.access_token) {
    throw AppError.badRequest('Instagram 응답에 access_token 이 없습니다.');
  }
  // 토큰 값은 절대 남기지 않고, 진단에 필요한 메타데이터만 남긴다.
  logger?.info(
    {
      keys: Object.keys(short),
      expiresIn: short.expires_in,
      tokenType: short.token_type,
      permissions: short.permissions,
    },
    'Instagram 단기 토큰 응답',
  );

  // 2) 단기 → 장기 토큰 (60일). 파라미터는 grant_type/client_secret/access_token 3개뿐(client_id 없음).
  //
  // 교환이 실패해도 연동 자체를 실패시키지 않는다. 앱 유형에 따라 1단계 토큰이 이미 장기(60일)로
  // 오는 경우가 있어서, 교환 실패가 곧 "쓸 수 없는 토큰"을 의미하지 않는다.
  // 실패 사유는 경고로 남겨 원인을 추적할 수 있게 한다.
  let accessToken = short.access_token;
  let expiresAt = short.expires_in ? new Date(Date.now() + short.expires_in * 1000) : undefined;

  const longUrl = new URL(`${GRAPH_HOST}/access_token`);
  longUrl.searchParams.set('grant_type', 'ig_exchange_token');
  longUrl.searchParams.set('client_secret', config.clientSecret ?? '');
  longUrl.searchParams.set('access_token', short.access_token);
  const longRes = await fetch(longUrl);

  if (longRes.ok) {
    const long = (await longRes.json()) as LongLivedToken;
    if (long.access_token) {
      accessToken = long.access_token;
      expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : expiresAt;
      logger?.info({ expiresIn: long.expires_in }, 'Instagram 장기 토큰 교환 성공');
    }
  } else {
    logger?.warn(
      { detail: await errorDetail(longRes), fallbackExpiresIn: short.expires_in },
      'Instagram 장기 토큰 교환 실패 — 1단계 토큰으로 진행합니다',
    );
  }

  // 3) 프로필 조회 — account_type 을 확인해 PERSONAL 계정을 걸러내기 위한 것.
  //    조회가 실패해도 연동 자체는 살린다: 토큰은 이미 유효하고, 계정 타입을 모른다고
  //    연동을 막으면 사용자는 아무것도 할 수 없다. (프로페셔널이 아니면 게시 단계에서 Meta 가 거부한다.)
  const profile = await fetchProfile(accessToken, logger);

  return {
    accessToken,
    expiresAt,
    // /me 응답은 값을 문자열로 주므로 안전하다. 폴백은 정밀도 보존해 추출한 값.
    platformUserId: profile.user_id ?? shortUserId ?? '',
    platformUsername: profile.username ?? '',
    accountType: profile.account_type,
  };
}

/**
 * 프로필 조회. 실패하면 예외를 던지지 않고 빈 객체를 반환한다 —
 * 호출자가 account_type 을 "알 수 없음"으로 취급하고 연동을 계속할 수 있게 한다.
 */
async function fetchProfile(accessToken: string, logger?: SnsLogger): Promise<IgProfile> {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/me`);
  url.searchParams.set('fields', 'user_id,username,account_type');
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  if (!res.ok) {
    logger?.warn(
      { detail: await errorDetail(res), url: `${GRAPH_HOST}/${GRAPH_VERSION}/me` },
      'Instagram 프로필 조회 실패 — account_type 확인 없이 연동을 진행합니다',
    );
    return {};
  }
  return (await res.json()) as IgProfile;
}

/**
 * 장기 토큰 갱신 (ig_refresh_token).
 * 발급 후 24시간이 지나야 갱신 가능하며, 만료된 토큰은 갱신할 수 없다.
 */
export async function refreshAccessToken(
  config: SnsProviderConfig,
  accessToken: string,
): Promise<TokenExchangeResult> {
  if (config.mock) {
    return {
      accessToken: `ig-mock-${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      platformUserId: '',
      platformUsername: '',
    };
  }
  const url = new URL(`${GRAPH_HOST}/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  if (!res.ok) {
    throw AppError.badRequest('Instagram 토큰 갱신에 실패했습니다.');
  }
  const body = (await res.json()) as LongLivedToken;
  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    platformUserId: '',
    platformUsername: '',
  };
}

export async function uploadReel(
  config: SnsProviderConfig,
  params: { accessToken: string; videoUrl: string; caption: string },
): Promise<UploadResult> {
  if (config.mock) {
    return { postId: `ig-post-${randomBytes(6).toString('hex')}` };
  }

  const base = `${GRAPH_HOST}/${GRAPH_VERSION}`;
  // 저장된 계정 ID 대신 `me` 를 쓴다 — 토큰이 곧 계정을 특정하므로 ID 불일치 위험이 없다.
  // (Instagram 의 user_id 는 2^53 을 넘어 JSON 숫자로 왕복하면 값이 틀어질 수 있다.)
  const owner = 'me';

  // 1) 컨테이너 생성 — Meta가 video_url 을 직접 내려받으므로 공개 URL이어야 한다.
  const createRes = await fetch(`${base}/${owner}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: params.videoUrl,
      caption: params.caption,
      access_token: params.accessToken,
    }),
  });
  if (!createRes.ok) {
    throw AppError.badRequest(
      `Instagram 릴스 컨테이너 생성에 실패했습니다. ${await errorDetail(createRes)}`,
    );
  }
  const { id: creationId } = (await createRes.json()) as { id: string };

  // 2) 처리 완료 대기 — 이 단계를 건너뛰면 media_publish 가 거의 항상 실패한다.
  await waitForContainer(base, creationId, params.accessToken);

  // 3) 게시
  const publishRes = await fetch(`${base}/${owner}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: params.accessToken }),
  });
  if (!publishRes.ok) {
    throw AppError.badRequest(`Instagram 릴스 게시에 실패했습니다. ${await errorDetail(publishRes)}`);
  }
  const { id: postId } = (await publishRes.json()) as { id: string };
  return { postId };
}

/** 컨테이너가 FINISHED 가 될 때까지 폴링. ERROR/EXPIRED/타임아웃은 예외. */
async function waitForContainer(base: string, creationId: string, accessToken: string): Promise<void> {
  const deadline = Date.now() + pollTimeoutMs();

  while (Date.now() < deadline) {
    const url = new URL(`${base}/${creationId}`);
    url.searchParams.set('fields', 'status_code,status');
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url);
    if (!res.ok) {
      throw AppError.badRequest(
        `Instagram 컨테이너 상태 조회에 실패했습니다. ${await errorDetail(res)}`,
      );
    }
    const body = (await res.json()) as { status_code?: string; status?: string };

    switch (body.status_code) {
      case 'FINISHED':
        return;
      case 'PUBLISHED':
        return; // 이미 게시된 컨테이너
      case 'ERROR':
      case 'EXPIRED':
        throw AppError.badRequest(
          `Instagram 영상 처리에 실패했습니다(${body.status_code}). ${body.status ?? ''}`.trim(),
        );
      default:
        // IN_PROGRESS
        await sleep(pollIntervalMs());
    }
  }

  throw AppError.badRequest('Instagram 영상 처리가 시간 내에 끝나지 않았습니다.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 에러 본문을 로그/메시지에 남길 수 있게 짧게 추출.
 * Meta 는 응답 형태가 두 가지다 — Graph 계열 `{error:{message,code}}` 와
 * Instagram OAuth 계열 `{error_type, code, error_message}`. 둘 다 처리한다.
 */
async function errorDetail(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    const body = JSON.parse(raw) as {
      error?: { message?: string; code?: number; error_subcode?: number; type?: string };
      error_type?: string;
      error_message?: string;
    };
    const nested = body.error;
    if (nested?.message) {
      const sub = nested.error_subcode ? `/${nested.error_subcode}` : '';
      return `(${res.status} ${nested.type ?? ''} ${nested.code ?? ''}${sub}: ${nested.message})`.replace(/\s+/g, ' ');
    }
    if (body.error_message) {
      return `(${res.status} ${body.error_type ?? ''}: ${body.error_message})`.replace(/\s+/g, ' ');
    }
    // 형태를 모르면 본문을 잘라서라도 남긴다 — 디버깅 불가가 더 나쁘다.
    return `(${res.status}: ${raw.slice(0, 200)})`;
  } catch {
    return `(${res.status})`;
  }
}
