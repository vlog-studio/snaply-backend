import type { SnsPlatform, SnsUploadStatus } from '@vlog-studio/shared-types';
import type { SnsConfig, SnsProviderConfig } from '../config.js';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { encrypt, decrypt, encodeState, decodeState } from '../lib/crypto.js';
import { createDownloadUrl } from './storage.service.js';
import * as instagram from './sns/instagram.client.js';
import * as tiktok from './sns/tiktok.client.js';
import type { SnsLogger, TokenExchangeResult } from './sns/types.js';

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

/** Meta 콘솔 웹훅 등록 시 입력한 "인증 토큰". 미설정이면 웹훅 검증을 거부한다. */
export function instagramWebhookVerifyToken(): string | undefined {
  return config().instagramWebhookVerifyToken;
}

/** 웹훅 페이로드 서명 검증에 쓰는 앱 시크릿. */
export function instagramAppSecret(): string | undefined {
  return config().instagram.clientSecret;
}

/** OAuth 콜백 처리 → 앱으로 돌아갈 딥링크 반환. */
export async function handleCallback(params: {
  platform: SnsPlatform;
  code: string;
  state: string;
  logger?: SnsLogger;
}): Promise<string> {
  const userId = decodeState(params.state);
  if (!userId) {
    // 콜백은 앱으로 리다이렉트하므로 JSON 에러 대신 에러 딥링크 반환
    return snsErrorDeepLink(params.platform, 'invalid_state');
  }
  const pc = providerConfig(params.platform);

  let token: TokenExchangeResult;
  if (params.platform === 'instagram') {
    token = await instagram.exchangeCode(pc, params.code, params.logger);
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

/**
 * 갱신을 시작할 여유 시간. 토큰 수명이 플랫폼마다 크게 달라 값도 다르다.
 * - TikTok: access_token 24시간 → 만료 직전에 refresh_token 으로 교환
 * - Instagram: 장기 토큰 60일 → 넉넉히 앞당겨 갱신(만료된 뒤에는 갱신 자체가 불가)
 */
const REFRESH_WINDOW_MS: Record<SnsPlatform, number> = {
  tiktok: 5 * 60 * 1000, // 5분
  instagram: 7 * 24 * 60 * 60 * 1000, // 7일
};

/** access_token 만료가 임박했으면 갱신하고 저장한다. */
async function ensureFreshToken(params: {
  connectionId: string;
  platform: SnsPlatform;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
}): Promise<string> {
  const currentAccess = decrypt(params.accessTokenEnc);
  if (params.expiresAt === null) {
    return currentAccess;
  }

  // 이미 만료됐으면 두 플랫폼 모두 갱신이 불가능하다 — 재연동을 안내한다.
  if (params.expiresAt.getTime() <= Date.now()) {
    throw AppError.badRequest('SNS 연동이 만료되었습니다. 계정을 다시 연동해 주세요.');
  }

  const needsRefresh =
    params.expiresAt.getTime() - Date.now() <= REFRESH_WINDOW_MS[params.platform];
  if (!needsRefresh) {
    return currentAccess;
  }

  let refreshed;
  if (params.platform === 'tiktok') {
    if (!params.refreshTokenEnc) {
      return currentAccess; // 갱신 수단이 없으면 현재 토큰으로 시도
    }
    refreshed = await tiktok.refreshAccessToken(
      providerConfig('tiktok'),
      decrypt(params.refreshTokenEnc),
    );
  } else {
    // Instagram 은 refresh_token 이 따로 없고 장기 토큰 자체를 교환한다.
    refreshed = await instagram.refreshAccessToken(providerConfig('instagram'), currentAccess);
  }

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

/** 사설/로컬 주소 판별 — 인스타·틱톡 서버가 도달할 수 없는 호스트. */
function isUnreachableHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  // 10.x, 127.x, 192.168.x, 172.16~31.x, 169.254.x
  return /^(10|127)\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

/**
 * 인스타/틱톡은 우리가 준 URL을 자기네 서버가 직접 내려받는다(PULL 방식).
 * 로컬 MinIO 주소 같은 걸 넘기면 플랫폼 쪽에서 알 수 없는 에러로 실패하므로 먼저 걸러낸다.
 */
function assertPubliclyFetchable(videoUrl: string, platform: SnsPlatform): void {
  if (providerConfig(platform).mock) {
    return; // mock 은 실제로 내려받지 않는다
  }
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    throw AppError.badRequest('영상 URL 형식이 올바르지 않습니다.');
  }
  // 로컬/사설 주소를 먼저 잡아준다 — 개발 중 가장 흔한 원인이라 메시지가 구체적일수록 좋다.
  if (isUnreachableHost(url.hostname)) {
    throw AppError.badRequest(
      `영상이 외부에서 접근할 수 없는 주소(${url.hostname})에 있습니다. `
        + 'SNS 업로드를 실검증하려면 CloudFront 등 공개 URL로 전환해야 합니다.',
    );
  }
  if (url.protocol !== 'https:') {
    throw AppError.badRequest('SNS 업로드에는 https 로 접근 가능한 영상 URL이 필요합니다.');
  }
}

export interface UploadDto {
  uploadId: string;
  platform: SnsPlatform;
  status: SnsUploadStatus;
  platformPostId: string | null;
  /**
   * true 면 업로드는 끝났지만 **사용자가 플랫폼 앱에서 마무리해야** 게시된다.
   * (틱톡 받은함 모드) 앱은 이 경우 "틱톡 앱에서 마무리하세요" 를 안내해야 한다.
   */
  requiresUserAction?: boolean;
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
    select: { id: true, editedUrl: true, editedS3Key: true },
  });
  if (!video) {
    throw AppError.notFound('영상을 찾을 수 없습니다.');
  }
  if (!video.editedS3Key && !video.editedUrl) {
    throw AppError.badRequest('편집이 완료된 영상만 업로드할 수 있습니다.');
  }
  // 우선순위: s3Key 가 있으면 presigned URL(비공개 버킷 대응), 없으면 저장된 공개 URL.
  const videoUrl = video.editedS3Key
    ? await createDownloadUrl(video.editedS3Key)
    : (video.editedUrl as string);

  // 최종적으로 플랫폼에 넘길 URL 을 검사한다. presigned 든 공개 URL 이든
  // 인스타·틱톡 서버가 실제로 도달할 수 있어야 한다.
  // (dev 에서 presigned 가 localhost 로 생성되면 여기서 걸린다 → S3_PUBLIC_ENDPOINT 필요)
  assertPubliclyFetchable(videoUrl, params.platform);

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
            // platformUserId 는 넘기지 않는다 — 게시 경로가 /me 로 바뀌었다.
            // (Instagram user_id 는 2^53 을 넘어 JSON 왕복 시 값이 틀어질 수 있다)
            videoUrl,
            caption: params.caption,
          })
        : await tiktok.uploadVideo(pc, {
            accessToken,
            videoUrl,
            caption: params.caption,
          });

    // 플랫폼 처리가 아직 진행 중이면 success 로 단정하지 않는다 (틱톡 PULL_FROM_URL).
    const status = result.status ?? 'success';
    const record = await prisma.snsUpload.create({
      data: {
        videoId: video.id,
        userId: params.userId,
        platform: params.platform,
        platformPostId: result.postId,
        status,
        uploadedAt: status === 'success' ? new Date() : null,
      },
      select: { id: true, platformPostId: true },
    });
    return {
      uploadId: record.id,
      platform: params.platform,
      status,
      platformPostId: record.platformPostId,
      ...(result.requiresUserAction ? { requiresUserAction: true } : {}),
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
