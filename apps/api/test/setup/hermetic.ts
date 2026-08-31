/**
 * 테스트를 개발자 개인 `apps/api/.env` 로부터 격리한다.
 *
 * 두 경로로 오염된다:
 *  1) Vitest 가 `.env` 를 process.env 에 주입한다.
 *  2) `@prisma/client` 를 import 하면 Prisma 가 dotenv 로 `.env` 를 다시 읽는다.
 *     dotenv 는 이미 있는 값은 덮지 않지만 **지워진 값은 다시 채운다** — 그래서 setupFiles 에서
 *     한 번 지우는 것만으로는 부족하고, 설정을 읽기 직전에 한 번 더 지워야 한다.
 *
 * 기본 상태는 "외부 연동 전부 mock/dry-run". 실키 경로를 검증하는 테스트만 harness(env)로 켠다.
 */
const EXTERNAL_CREDENTIAL_KEYS = [
  'REVENUECAT_API_KEY',
  'BILLING_MOCK',
  // CREDIT_SIGNUP_BONUS 는 여기 두면 안 된다 — 지우면 dotenv 가 개인 .env 값으로 되살린다.
  // env.ts 가 '0' 으로 박아두고(존재하는 값은 dotenv 가 덮지 않음), 필요한 테스트만 직접 덮는다.
  'SNS_MOCK',
  'INSTAGRAM_APP_ID',
  'INSTAGRAM_APP_SECRET',
  'INSTAGRAM_REDIRECT_URI',
  'INSTAGRAM_GRAPH_VERSION',
  'INSTAGRAM_WEBHOOK_VERIFY_TOKEN',
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'TIKTOK_REDIRECT_URI',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'SENTRY_DSN',
  'CLOUDFRONT_DOMAIN',
  'RATE_LIMIT_GLOBAL_MAX',
];

export function clearExternalCredentials(): void {
  for (const key of EXTERNAL_CREDENTIAL_KEYS) {
    delete process.env[key];
  }
}
