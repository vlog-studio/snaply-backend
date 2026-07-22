export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string | undefined;
  supabaseUrl: string;
  /** Supabase Auth JWKS 엔드포인트 (ES256 비대칭 키) */
  jwksUrl: string;
  /** JWT 발급자(iss) — Supabase Auth */
  jwtIssuer: string;
  /** JWT 대상(aud) */
  jwtAudience: string;
  storage: StorageConfig;
  redis: RedisConfig;
}

export interface RedisConfig {
  url: string;
  editQueueName: string;
}

export interface StorageConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO 등 S3 호환 서버용 커스텀 endpoint. 미설정 시 실제 AWS S3. */
  endpoint: string | undefined;
  /** MinIO는 path-style(엔드포인트/버킷/키)이 필요. endpoint가 있으면 자동 true. */
  forcePathStyle: boolean;
  /** 공개 URL 베이스. 운영은 CloudFront, 개발은 MinIO 공개 URL. */
  publicBaseUrl: string;
  presignExpirySeconds: number;
  maxUploadBytes: number;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경 변수 ${key}가 설정되지 않았습니다.`);
  }
  return value;
}

function loadStorageConfig(): StorageConfig {
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '') || undefined;
  const bucket = requireEnv('S3_BUCKET_NAME');
  const cloudfront = process.env.CLOUDFRONT_DOMAIN?.replace(/\/$/, '');

  // 공개 URL: CloudFront가 있으면 우선(운영), 없으면 MinIO 등 endpoint의 path-style URL(개발)
  const publicBaseUrl =
    cloudfront ??
    (endpoint ? `${endpoint}/${bucket}` : `https://${bucket}.s3.amazonaws.com`);

  return {
    region: process.env.AWS_REGION ?? 'ap-northeast-2',
    bucket,
    accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    endpoint,
    forcePathStyle: Boolean(endpoint),
    publicBaseUrl,
    presignExpirySeconds: Number(process.env.S3_PRESIGN_EXPIRY_SECONDS ?? 15 * 60),
    maxUploadBytes: Number(process.env.S3_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024),
  };
}

export function loadConfig(): AppConfig {
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');

  return {
    port: Number(process.env.API_PORT ?? 3000),
    host: process.env.API_HOST ?? '0.0.0.0',
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl,
    jwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    jwtIssuer: `${supabaseUrl}/auth/v1`,
    jwtAudience: process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated',
    storage: loadStorageConfig(),
    redis: {
      url: requireEnv('REDIS_URL'),
      editQueueName: process.env.EDIT_QUEUE_NAME ?? 'edit-jobs',
    },
  };
}
