import type { RequiredEnvKey } from './env-spec.js';

export interface AppConfig {
  port: number;
  host: string;
  /**
   * 믿을 앞단 프록시 주소(IP·CIDR·프리셋). 비어 있으면 X-Forwarded-For 를 믿지 않는다
   * (프록시 없이 직접 받는 서버).
   */
  trustProxy: string[];
  databaseUrl: string;
  supabaseUrl: string;
  /** Swagger 개발 로그인에서 사용하는 공개 API 키. */
  supabasePublishableKey: string | undefined;
  /** Auth Admin API 용 service role key. 계정 실삭제(purge)에서만 사용, 클라이언트 노출 금지. */
  supabaseServiceRoleKey: string | undefined;
  /** Supabase Auth JWKS 엔드포인트 (ES256 비대칭 키) */
  jwksUrl: string;
  /** JWT 발급자(iss) — Supabase Auth */
  jwtIssuer: string;
  /** JWT 대상(aud) */
  jwtAudience: string;
  storage: StorageConfig;
  redis: RedisConfig;
  firebase: FirebaseConfig;
  sns: SnsConfig;
  billing: BillingConfig;
}

export interface BillingConfig {
  /** RevenueCat REST 시크릿 키. `/billing/sync` 의 구매 이력 조회에만 쓴다. */
  apiKey: string | undefined;
  /** 웹훅 Authorization 헤더에 와야 하는 값. RevenueCat 은 서명이 아닌 헤더 시크릿 방식이다. */
  webhookAuthToken: string;
  /** 실키 미설정 시 RevenueCat 호출을 모의(mock)한다. 웹훅 인증은 mock 에서도 그대로 검증한다. */
  mock: boolean;
  admob: AdMobConfig;
}

/** 보상형 광고 SSV. 정책값(보상량·한도)은 여기가 아니라 `billing/credit-policy.ts` 가 원천이다. */
export interface AdMobConfig {
  /**
   * SSV 를 받아들일 광고 단위 ID 목록. **비어 있으면 어떤 광고 단위도 받지 않는다** —
   * 지급 경로이므로 "설정 안 함 = 전부 허용" 으로 열지 않는다.
   */
  allowedAdUnits: readonly string[];
  /** 서명 검증 공개키 세트. 테스트는 로컬 키셋(`file:` URL)으로 바꿔 끼운다. */
  verifierKeysUrl: string;
}

export interface SnsProviderConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
  /** 실키 미설정 시 외부 API 호출을 모의(mock)한다. */
  mock: boolean;
}

export interface SnsConfig {
  instagram: SnsProviderConfig;
  tiktok: SnsProviderConfig;
  /** access_token 암호화 키 (임의 문자열, 내부적으로 sha256으로 32바이트화). */
  tokenEncryptionKey: string;
  /** OAuth 완료 후 앱으로 돌아가는 딥링크 스킴. */
  appDeepLinkScheme: string;
  /**
   * 인스타 웹훅 등록 시 Meta 콘솔에 입력하는 "인증 토큰"(직접 정하는 임의 문자열).
   * 게시 기능 자체에는 필요 없지만, 콘솔의 웹훅 설정 단계를 통과하려면 검증 응답이 필요하다.
   */
  instagramWebhookVerifyToken: string | undefined;
}

export interface FirebaseConfig {
  projectId: string | undefined;
  /** 서비스 계정 JSON(base64). 없으면 FCM은 dry-run(로그만). */
  serviceAccountJson: string | undefined;
}

export interface RedisConfig {
  url: string;
  editQueueName: string;
  /** editSpec v3(경계별 전환) 전용 편집 큐. 워커와 같은 값이어야 한다. */
  editV3QueueName: string;
  /** 스냅 분석 큐. 분석 워커와 같은 값이어야 작업이 전달된다. */
  analysisQueueName: string;
  renditionQueueName: string;
  notificationQueueName: string;
}

export interface StorageConfig {
  region: string;
  bucket: string;
  /**
   * 정적 키. 없으면 SDK 기본 체인을 쓴다 — AWS 서버는 키 없이 인스턴스 역할로 붙는다.
   * MinIO(endpoint)는 기본 체인이 줄 자격증명이 없으므로 반드시 있다(loadStorageConfig 가 강제).
   */
  credentials: { accessKeyId: string; secretAccessKey: string } | undefined;
  /** MinIO 등 S3 호환 서버용 커스텀 endpoint. 미설정 시 실제 AWS S3. */
  endpoint: string | undefined;
  /** Client-reachable S3-compatible endpoint used to create presigned URLs. */
  publicEndpoint: string | undefined;
  /** MinIO는 path-style(엔드포인트/버킷/키)이 필요. endpoint가 있으면 자동 true. */
  forcePathStyle: boolean;
  /** 공개 URL 베이스. 운영은 CloudFront, 개발은 MinIO 공개 URL. */
  publicBaseUrl: string;
  presignExpirySeconds: number;
  downloadUrlExpirySeconds: number;
  maxUploadBytes: number;
}

/**
 * 키 타입이 `RequiredEnvKey` 라서, env-spec 에 `required: true` 로 선언하지 않은 변수는
 * 여기에 넘길 수 없다. 강제 목록과 스펙이 어긋나면 타입체크에서 걸린다.
 */
function requireEnv(key: RequiredEnvKey): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경 변수 ${key}가 설정되지 않았습니다.`);
  }
  return value;
}

function loadStorageConfig(): StorageConfig {
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '') || undefined;
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT?.replace(/\/$/, '') || undefined;
  const bucket = requireEnv('S3_BUCKET_NAME');
  // `|| undefined` — 빈 문자열도 "미설정"으로 본다. compose가 CLOUDFRONT_DOMAIN=""을 주입하는데
  // `??`로 두면 빈 문자열이 그대로 통과해 publicBaseUrl이 ''이 된다.
  const cloudfront = process.env.CLOUDFRONT_DOMAIN?.replace(/\/$/, '') || undefined;

  // 공개 URL: CloudFront가 있으면 우선(운영), 없으면 MinIO 등 endpoint의 path-style URL(개발)
  const publicBaseUrl =
    cloudfront ??
    (publicEndpoint
      ? `${publicEndpoint}/${bucket}`
      : endpoint
        ? `${endpoint}/${bucket}`
        : `https://${bucket}.s3.amazonaws.com`);

  // 빈 문자열도 미설정이다 — AWS 서버의 compose 가 키를 ""로 덮어 인스턴스 역할만 쓰게 한다.
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || undefined;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || undefined;
  // 한쪽만 있으면 오타이거나 반쯤 지운 것이다. 기본 체인으로 넘어가면 엉뚱한 자격증명으로 뜬다.
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('AWS_ACCESS_KEY_ID 와 AWS_SECRET_ACCESS_KEY 는 둘 다 넣거나 둘 다 비워야 합니다.');
  }
  // MinIO 는 기본 체인으로 붙을 수 없다. 키 없이 뜨면 첫 업로드에서야 실패하므로 기동을 거부한다.
  if (endpoint && !accessKeyId) {
    throw new Error('S3_ENDPOINT(MinIO 등)를 쓰면 AWS_ACCESS_KEY_ID·AWS_SECRET_ACCESS_KEY 가 필요합니다.');
  }

  return {
    region: process.env.AWS_REGION ?? 'ap-northeast-2',
    bucket,
    credentials:
      accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    endpoint,
    publicEndpoint,
    forcePathStyle: Boolean(endpoint),
    publicBaseUrl,
    presignExpirySeconds: Number(process.env.S3_PRESIGN_EXPIRY_SECONDS ?? 15 * 60),
    downloadUrlExpirySeconds: Number(
      process.env.S3_DOWNLOAD_URL_EXPIRY_SECONDS ?? 60 * 60,
    ),
    maxUploadBytes: Number(process.env.S3_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024),
  };
}

const TRUST_PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * 홉 수(`1`)나 `true` 는 받지 않는다. Fastify 는 홉 수만으로는 직접 접속한 클라이언트의 위조를
 * 막을 수 없어 숫자를 주면 아무것도 믿지 않는다 — 조용히 프록시 IP 하나로 묶인 채 뜬다. `true` 는
 * 누구의 X-Forwarded-For 든 믿는다. 주소 형식 자체의 검사는 Fastify 가 기동 시점에 한다.
 */
function loadTrustProxy(): string[] {
  const entries = (process.env.TRUST_PROXY ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    if (!TRUST_PROXY_PRESETS.has(entry) && !/[.:]/.test(entry)) {
      throw new Error(
        `TRUST_PROXY 는 프록시의 IP·CIDR 또는 loopback·linklocal·uniquelocal 이어야 합니다: ${entry}`,
      );
    }
  }
  return entries;
}

export function loadConfig(): AppConfig {
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');

  return {
    port: Number(process.env.API_PORT ?? 3000),
    host: process.env.API_HOST ?? '0.0.0.0',
    trustProxy: loadTrustProxy(),
    databaseUrl: requireEnv('DATABASE_URL'),
    supabaseUrl,
    supabasePublishableKey:
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || undefined,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    jwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    jwtIssuer: `${supabaseUrl}/auth/v1`,
    jwtAudience: process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated',
    storage: loadStorageConfig(),
    redis: {
      url: requireEnv('REDIS_URL'),
      editQueueName: process.env.EDIT_QUEUE_NAME ?? 'edit-jobs',
      editV3QueueName: process.env.EDIT_V3_QUEUE_NAME ?? 'edit-v3',
      analysisQueueName: process.env.VIDEO_ANALYSIS_QUEUE_NAME ?? 'video-analysis',
      renditionQueueName: process.env.RENDITION_QUEUE_NAME ?? 'renditions',
      notificationQueueName: process.env.NOTIFICATION_QUEUE_NAME ?? 'notifications',
    },
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      serviceAccountJson: decodeServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
    },
    sns: loadSnsConfig(),
    billing: {
      apiKey: process.env.REVENUECAT_API_KEY || undefined,
      webhookAuthToken: process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN || 'dev-webhook-token',
      // SNS_MOCK 과 분리 — SNS 는 mock 인 채로 결제만 실키로 검증할 수 있어야 한다.
      mock: process.env.BILLING_MOCK === 'true' || !process.env.REVENUECAT_API_KEY,
      admob: {
        allowedAdUnits: (process.env.ADMOB_SSV_ALLOWED_AD_UNITS ?? '')
          .split(',')
          .map((unit) => unit.trim())
          .filter((unit) => unit.length > 0),
        verifierKeysUrl:
          process.env.ADMOB_VERIFIER_KEYS_URL
          || 'https://www.gstatic.com/admob/reward/verifier-keys.json',
      },
    },
  };
}

function loadSnsConfig(): SnsConfig {
  const forceMock = process.env.SNS_MOCK === 'true';
  const instagram: SnsProviderConfig = {
    clientId: process.env.INSTAGRAM_APP_ID,
    clientSecret: process.env.INSTAGRAM_APP_SECRET,
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI,
    mock: forceMock || !process.env.INSTAGRAM_APP_ID,
  };
  const tiktok: SnsProviderConfig = {
    clientId: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirectUri: process.env.TIKTOK_REDIRECT_URI,
    mock: forceMock || !process.env.TIKTOK_CLIENT_KEY,
  };
  return {
    instagram,
    tiktok,
    tokenEncryptionKey: process.env.SNS_TOKEN_ENCRYPTION_KEY ?? 'dev-insecure-sns-key',
    appDeepLinkScheme: process.env.APP_DEEPLINK_SCHEME ?? 'snaplyapp://',
    instagramWebhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || undefined,
  };
}

/** base64로 인코딩된 서비스 계정 JSON을 디코드. 평문 JSON도 허용. */
function decodeServiceAccount(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return trimmed;
  }
  try {
    return Buffer.from(trimmed, 'base64').toString('utf-8');
  } catch {
    return undefined;
  }
}
