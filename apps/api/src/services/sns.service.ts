import type { SnsPlatform, SnsUploadStatus } from '@vlog-studio/shared-types';
import type { SnsConfig, SnsProviderConfig } from '../config.js';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { encrypt, decrypt, encodeState, decodeState } from '../lib/crypto.js';
import * as instagram from './sns/instagram.client.js';
import * as tiktok from './sns/tiktok.client.js';
import type { TokenExchangeResult } from './sns/types.js';

let cfg: SnsConfig | null = null;

export function initSns(config: SnsConfig): void {
  cfg = config;
}

function config(): SnsConfig {
  if (!cfg) {
    throw new Error('sns가 초기화되지 않았습니다. initSns(config)를 먼저 호출하세요.');
  }
  return cfg;
}

function providerConfig(platform: SnsPlatform): SnsProviderConfig {
  return platform === 'instagram' ? config().instagram : config().tiktok;
}

export function buildConnectUrl(platform: SnsPlatform, userId: string): string {
  const state = encodeState(userId);
  const pc = providerConfig(platform);
  return platform === 'instagram'
    ? instagram.authorizeUrl(pc, state)
    : tiktok.authorizeUrl(pc, state);
}

function deepLink(pathAndQuery: string): string {
  return `${config().appDeepLinkScheme}${pathAndQuery}`;
}

export function snsErrorDeepLink(platform: SnsPlatform, reason: string): string {
  return deepLink(`sns/error?platform=${platform}&reason=${reason}`);
}

/** OAuth 콜백 처리 → 앱으로 돌아갈 딥링크 반환. */
export async function handleCallback(params: {
  platform: SnsPlatform;
  code: string;
  state: string;
}): Promise<string> {
  const userId = decodeState(params.state);
  if (!userId) {
    // 콜백은 앱으로 리다이렉트하므로 JSON 에러 대신 에러 딥링크 반환
    return snsErrorDeepLink(params.platform, 'invalid_state');
  }
  const pc = providerConfig(params.platform);

  let token: TokenExchangeResult;
  if (params.platform === 'instagram') {
    token = await instagram.exchangeCode(pc, params.code);
    // 비즈니스/크리에이터 계정만 릴스 업로드 가능
    if (token.accountType && !['BUSINESS', 'CREATOR'].includes(token.accountType)) {
      return deepLink('sns/error?platform=instagram&reason=account_type');
    }
  } else {
    token = await tiktok.exchangeCode(pc, params.code);
  }

  await getPrisma().snsConnection.upsert({
    where: { userId_platform: { userId, platform: params.platform } },
    update: {
      platformUserId: token.platformUserId,
      platformUsername: token.platformUsername,
      accessToken: encrypt(token.accessToken),
      refreshToken: token.refreshToken ? encrypt(token.refreshToken) : null,
      tokenExpiresAt: token.expiresAt ?? null,
    },
    create: {
      userId,
      platform: params.platform,
      platformUserId: token.platformUserId,
      platformUsername: token.platformUsername,
      accessToken: encrypt(token.accessToken),
      refreshToken: token.refreshToken ? encrypt(token.refreshToken) : null,
      tokenExpiresAt: token.expiresAt ?? null,
    },
  });

  return deepLink(`sns/connected?platform=${params.platform}`);
}

export interface ConnectionDto {
  platform: SnsPlatform;
  platformUsername: string | null;
  connectedAt: string;
}

export async function listConnections(userId: string): Promise<ConnectionDto[]> {
  const rows = await getPrisma().snsConnection.findMany({
    where: { userId },
    select: { platform: true, platformUsername: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    platform: r.platform as SnsPlatform,
    platformUsername: r.platformUsername,
    connectedAt: r.createdAt.toISOString(),
  }));
}

export async function disconnect(userId: string, platform: SnsPlatform): Promise<void> {
  const res = await getPrisma().snsConnection.deleteMany({ where: { userId, platform } });
  if (res.count === 0) {
    throw AppError.notFound('연동된 계정이 없습니다.');
  }
}

/** TikTok access_token 만료 임박 시 refresh_token으로 갱신하고 저장. */
async function ensureFreshToken(params: {
  connectionId: string;
  platform: SnsPlatform;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
}): Promise<string> {
  const validAccess = decrypt(params.accessTokenEnc);
  const soon = new Date(Date.now() + 5 * 60 * 1000);
  const needsRefresh = params.expiresAt !== null && params.expiresAt <= soon;

  if (params.platform !== 'tiktok' || !needsRefresh || !params.refreshTokenEnc) {
    return validAccess;
  }

  const refreshed = await tiktok.refreshAccessToken(
    providerConfig('tiktok'),
    decrypt(params.refreshTokenEnc),
  );
  await getPrisma().snsConnection.update({
    where: { id: params.connectionId },
    data: {
      accessToken: encrypt(refreshed.accessToken),
      refreshToken: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : undefined,
      tokenExpiresAt: refreshed.expiresAt ?? null,
    },
  });
  return refreshed.accessToken;
}

export interface UploadDto {
  uploadId: string;
  platform: SnsPlatform;
  status: SnsUploadStatus;
  platformPostId: string | null;
}

export async function upload(params: {
  userId: string;
  platform: SnsPlatform;
  videoId: string;
  caption: string;
}): Promise<UploadDto> {
  const prisma = getPrisma();

  const connection = await prisma.snsConnection.findUnique({
    where: { userId_platform: { userId: params.userId, platform: params.platform } },
  });
  if (!connection) {
    throw AppError.badRequest('먼저 SNS 계정을 연동하세요.');
  }

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, userId: params.userId, deletedAt: null },
    select: { id: true, editedUrl: true },
  });
  if (!video) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }
  if (!video.editedUrl) {
    throw AppError.badRequest('편집이 완료된 영상만 업로드할 수 있습니다.');
  }

  const accessToken = await ensureFreshToken({
    connectionId: connection.id,
    platform: params.platform,
    accessTokenEnc: connection.accessToken ?? '',
    refreshTokenEnc: connection.refreshToken,
    expiresAt: connection.tokenExpiresAt,
  });

  const pc = providerConfig(params.platform);
  try {
    const result =
      params.platform === 'instagram'
        ? await instagram.uploadReel(pc, {
            accessToken,
            platformUserId: connection.platformUserId ?? '',
            videoUrl: video.editedUrl,
            caption: params.caption,
          })
        : await tiktok.uploadVideo(pc, {
            accessToken,
            videoUrl: video.editedUrl,
            caption: params.caption,
          });

    const record = await prisma.snsUpload.create({
      data: {
        videoId: video.id,
        userId: params.userId,
        platform: params.platform,
        platformPostId: result.postId,
        status: 'success',
        uploadedAt: new Date(),
      },
      select: { id: true, platformPostId: true },
    });
    return {
      uploadId: record.id,
      platform: params.platform,
      status: 'success',
      platformPostId: record.platformPostId,
    };
  } catch (err) {
    await prisma.snsUpload.create({
      data: {
        videoId: video.id,
        userId: params.userId,
        platform: params.platform,
        status: 'failed',
      },
    });
    if (err instanceof AppError) {
      throw err;
    }
    throw AppError.badRequest('SNS 업로드에 실패했습니다.');
  }
}
