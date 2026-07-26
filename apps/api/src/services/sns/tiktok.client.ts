import { randomBytes } from 'node:crypto';
import type { SnsProviderConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import type { TokenExchangeResult, UploadResult } from './types.js';

const SCOPE = 'user.info.basic,video.publish';

export function authorizeUrl(config: SnsProviderConfig, state: string): string {
  if (config.mock) {
    const params = new URLSearchParams({ state, mock: 'tiktok' });
    return `mock://tiktok/authorize?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_key: config.clientId ?? '',
    redirect_uri: config.redirectUri ?? '',
    scope: SCOPE,
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
  if (!res.ok) {
    throw AppError.badRequest('TikTok 토큰 교환에 실패했습니다.');
  }
  const b = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    open_id: string;
  };
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresAt: new Date(Date.now() + b.expires_in * 1000),
    platformUserId: b.open_id,
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
  if (!res.ok) {
    throw AppError.badRequest('TikTok 토큰 갱신에 실패했습니다.');
  }
  const b = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresAt: new Date(Date.now() + b.expires_in * 1000),
    platformUserId: '',
    platformUsername: '',
  };
}

export async function uploadVideo(
  config: SnsProviderConfig,
  params: { accessToken: string; videoUrl: string; caption: string },
): Promise<UploadResult> {
  if (config.mock) {
    return { postId: `tt-post-${randomBytes(6).toString('hex')}` };
  }
  // 운영: Content Posting API v2 (PULL_FROM_URL)
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      post_info: { title: params.caption, privacy_level: 'SELF_ONLY' },
      source_info: { source: 'PULL_FROM_URL', video_url: params.videoUrl },
    }),
  });
  if (!res.ok) {
    throw AppError.badRequest('TikTok 업로드에 실패했습니다.');
  }
  const b = (await res.json()) as { data?: { publish_id?: string } };
  return { postId: b.data?.publish_id ?? '' };
}
