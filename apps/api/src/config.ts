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
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경 변수 ${key}가 설정되지 않았습니다.`);
  }
  return value;
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
  };
}
