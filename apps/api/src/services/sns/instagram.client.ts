import { randomBytes } from 'node:crypto';
import type { SnsProviderConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import type { TokenExchangeResult, UploadResult } from './types.js';

const SCOPE = 'instagram_basic,instagram_content_publish';

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
  return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(
  config: SnsProviderConfig,
  code: string,
): Promise<TokenExchangeResult> {
  if (config.mock) {
    // code='mock-personal' 이면 일반 계정으로 시뮬레이션(릴스 업로드 불가 경로 검증용)
    const accountType = code === 'mock-personal' ? 'PERSONAL' : 'BUSINESS';
    return {
      accessToken: `ig-mock-${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60일(장기 토큰 가정)
      platformUserId: `ig-user-${randomBytes(4).toString('hex')}`,
      platformUsername: 'mock_instagram_user',
      accountType,
    };
  }

  // 운영: code → 단기 토큰 교환 (실제로는 장기 토큰 교환 + 계정 타입 조회가 추가됨)
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
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
  if (!res.ok) {
    throw AppError.badRequest('Instagram 토큰 교환에 실패했습니다.');
  }
  const body = (await res.json()) as { access_token: string; user_id: string | number };
  return {
    accessToken: body.access_token,
    platformUserId: String(body.user_id),
    platformUsername: '',
    accountType: 'BUSINESS',
  };
}

export async function uploadReel(
  config: SnsProviderConfig,
  params: { accessToken: string; platformUserId: string; videoUrl: string; caption: string },
): Promise<UploadResult> {
  if (config.mock) {
    return { postId: `ig-post-${randomBytes(6).toString('hex')}` };
  }

  // 운영: 컨테이너 생성 → (처리 대기) → 게시
  const base = `https://graph.facebook.com/v20.0/${params.platformUserId}`;
  const createRes = await fetch(`${base}/media`, {
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
    throw AppError.badRequest('Instagram 릴스 컨테이너 생성에 실패했습니다.');
  }
  const { id: creationId } = (await createRes.json()) as { id: string };

  const publishRes = await fetch(`${base}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: params.accessToken }),
  });
  if (!publishRes.ok) {
    throw AppError.badRequest('Instagram 릴스 게시에 실패했습니다.');
  }
  const { id: postId } = (await publishRes.json()) as { id: string };
  return { postId };
}
