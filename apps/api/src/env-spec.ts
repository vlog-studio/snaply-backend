/**
 * 환경변수의 단일 원천.
 *
 * 저장소가 읽는 모든 환경변수를 여기에 선언한다. `.env.example` 은 이 목록의 사람용 표현이고,
 * 둘이 어긋나면 `test/env-spec.test.ts` 가 실패한다. 새 변수를 쓰기 시작했다면 **여기부터** 고친다.
 *
 * 값이 오는 경로는 두 가지다 (docs/decisions/env-management.md):
 *  - 로컬: `apps/api/.env` 파일
 *  - 운영: 배포 플랫폼의 시크릿 주입 (파일은 이미지에 들어가지 않는다)
 *
 * `origin` 은 그 변수가 어느 쪽에서 의미를 갖는지를 말한다 — 운영 시크릿 스토어에 넣어야 할
 * 목록은 `origin !== 'local'` 인 항목들이다.
 */

/** 변수가 의미를 갖는 환경. */
export type EnvOrigin =
  /** 로컬·운영 모두 필요 */
  | 'shared'
  /** 로컬 개발에서만 의미 있음 (운영에서는 비우거나 주입하지 않는다) */
  | 'local'
  /** 운영에서만 의미 있음 */
  | 'production';

export interface EnvVarSpec {
  key: string;
  /**
   * true 면 API 서버가 기동 시점에 값을 강제한다(`config.ts` 의 `requireEnv`).
   * 누락 시 조용히 잘못 도는 대신 기동에 실패한다.
   */
  required: boolean;
  origin: EnvOrigin;
  /** 어디서 읽는지 + 무슨 값인지. `.env.example` 의 주석과 같은 내용을 유지한다. */
  description: string;
}

export const ENV_VARS = [
  // ── Database ─────────────────────────────────────────
  {
    key: 'DATABASE_URL',
    required: false,
    origin: 'shared',
    description: 'Prisma 런타임 연결 문자열. 운영은 pgbouncer(6543) 경유',
  },
  {
    key: 'DIRECT_URL',
    required: false,
    origin: 'shared',
    description: 'Prisma 마이그레이션용 직접 연결(5432). Prisma CLI 전용',
  },
  {
    key: 'POSTGRES_HOST_PORT',
    required: false,
    origin: 'local',
    description:
      'docker-compose.dev.yml 의 postgres 호스트 포트. 기본 5432. 코드가 아니라 compose 가 읽는다',
  },

  // ── Supabase ─────────────────────────────────────────
  {
    key: 'SUPABASE_URL',
    required: true,
    origin: 'shared',
    description: 'JWKS·issuer 를 여기서 파생한다. 없으면 인증이 전부 실패',
  },
  {
    key: 'SUPABASE_PUBLISHABLE_KEY',
    required: false,
    origin: 'shared',
    description: 'sb_publishable_... Swagger 개발 로그인/클라이언트용',
  },
  {
    key: 'SUPABASE_ANON_KEY',
    required: false,
    origin: 'shared',
    description: '레거시 fallback. 신규 프로젝트는 PUBLISHABLE 을 쓴다',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    required: false,
    origin: 'shared',
    description:
      '계정 실삭제 배치(accounts:purge)와 scripts/media-cleanup.mjs 가 사용. 클라이언트 노출 금지',
  },
  {
    key: 'SUPABASE_JWT_AUDIENCE',
    required: false,
    origin: 'shared',
    description: 'JWT aud 클레임. 기본값 authenticated',
  },

  // ── S3 스토리지 ──────────────────────────────────────
  {
    key: 'AWS_ACCESS_KEY_ID',
    required: true,
    origin: 'shared',
    description: '개발은 MinIO 루트 계정, 운영은 IAM',
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    required: true,
    origin: 'shared',
    description: '개발은 MinIO 루트 비밀번호, 운영은 IAM',
  },
  {
    key: 'AWS_REGION',
    required: false,
    origin: 'shared',
    description: '기본값 ap-northeast-2',
  },
  {
    key: 'S3_BUCKET_NAME',
    required: true,
    origin: 'shared',
    description: '클립·렌더 결과가 들어가는 버킷',
  },
  {
    key: 'S3_ENDPOINT',
    required: false,
    origin: 'local',
    description: 'MinIO 등 S3 호환 서버 주소. 비우면 실제 AWS S3',
  },
  {
    key: 'S3_PUBLIC_ENDPOINT',
    required: false,
    origin: 'shared',
    description: '클라이언트가 접근할 주소. presigned URL 과 공개 URL 에 사용',
  },
  {
    key: 'CLOUDFRONT_DOMAIN',
    required: false,
    origin: 'production',
    description: '공개 URL 베이스. 있으면 S3_PUBLIC_ENDPOINT 보다 우선',
  },
  {
    key: 'S3_PRESIGN_EXPIRY_SECONDS',
    required: false,
    origin: 'shared',
    description: '업로드 presigned URL 만료. 기본 15분',
  },
  {
    key: 'S3_DOWNLOAD_URL_EXPIRY_SECONDS',
    required: false,
    origin: 'shared',
    description: '재생 URL 만료. 기본 1시간. 워커도 읽는다',
  },
  {
    key: 'S3_MAX_UPLOAD_BYTES',
    required: false,
    origin: 'shared',
    description: '단일 클립 최대 크기. 기본 500MB',
  },

  // ── Firebase ─────────────────────────────────────────
  {
    key: 'FIREBASE_PROJECT_ID',
    required: false,
    origin: 'shared',
    description: '미설정 시 FCM 은 dry-run',
  },
  {
    key: 'FIREBASE_SERVICE_ACCOUNT_KEY',
    required: false,
    origin: 'shared',
    description: '서비스 계정 JSON(base64). 평문 JSON 도 허용',
  },

  // ── Redis / 큐 ───────────────────────────────────────
  {
    key: 'REDIS_URL',
    required: true,
    origin: 'shared',
    description: 'BullMQ 큐. 워커도 같은 값을 읽는다',
  },
  {
    key: 'EDIT_QUEUE_NAME',
    required: false,
    origin: 'shared',
    description: '편집 큐 이름. 기본 edit-jobs. API 와 워커가 일치해야 한다',
  },

  // ── Stripe ───────────────────────────────────────────
  {
    key: 'STRIPE_SECRET_KEY',
    required: false,
    origin: 'shared',
    description: '비어 있으면 자동 mock 모드',
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    required: false,
    origin: 'shared',
    description: '`stripe listen` 이 출력하는 whsec_...',
  },
  {
    key: 'STRIPE_PRICE_STANDARD',
    required: false,
    origin: 'shared',
    description: 'price_... (Standard)',
  },
  {
    key: 'STRIPE_PRICE_PREMIUM',
    required: false,
    origin: 'shared',
    description: 'price_... (Premium)',
  },
  {
    key: 'STRIPE_MOCK',
    required: false,
    origin: 'local',
    description: 'true 면 실키가 있어도 강제 mock. SNS_MOCK 과 독립',
  },

  // ── Instagram ────────────────────────────────────────
  {
    key: 'INSTAGRAM_APP_ID',
    required: false,
    origin: 'shared',
    description: '비어 있으면 인스타 연동이 mock 으로 동작',
  },
  {
    key: 'INSTAGRAM_APP_SECRET',
    required: false,
    origin: 'shared',
    description: 'Meta 앱 시크릿',
  },
  {
    key: 'INSTAGRAM_REDIRECT_URI',
    required: false,
    origin: 'shared',
    description: 'OAuth 콜백. 고정 도메인이 필요하다',
  },
  {
    key: 'INSTAGRAM_WEBHOOK_VERIFY_TOKEN',
    required: false,
    origin: 'shared',
    description: 'Meta 콘솔에 입력하는 값과 같아야 한다',
  },
  {
    key: 'INSTAGRAM_GRAPH_VERSION',
    required: false,
    origin: 'shared',
    description: 'graph.instagram.com API 버전',
  },
  {
    key: 'INSTAGRAM_POLL_INTERVAL_MS',
    required: false,
    origin: 'shared',
    description: '릴스 컨테이너 상태 폴링 간격',
  },
  {
    key: 'INSTAGRAM_POLL_TIMEOUT_MS',
    required: false,
    origin: 'shared',
    description: '릴스 컨테이너 처리 대기 한도',
  },

  // ── TikTok ───────────────────────────────────────────
  {
    key: 'TIKTOK_CLIENT_KEY',
    required: false,
    origin: 'shared',
    description: '비어 있으면 틱톡 연동이 mock 으로 동작',
  },
  {
    key: 'TIKTOK_CLIENT_SECRET',
    required: false,
    origin: 'shared',
    description: 'TikTok 앱 시크릿. Sandbox 는 자체 키를 쓴다',
  },
  {
    key: 'TIKTOK_REDIRECT_URI',
    required: false,
    origin: 'shared',
    description: 'OAuth 콜백. 고정 도메인이 필요하다',
  },
  {
    key: 'TIKTOK_SCOPES',
    required: false,
    origin: 'shared',
    description: '엔드포인트가 이 값에서 결정된다. 심사 전에는 video.upload',
  },
  {
    key: 'TIKTOK_POLL_INTERVAL_MS',
    required: false,
    origin: 'shared',
    description: '게시 상태 폴링 간격',
  },
  {
    key: 'TIKTOK_POLL_TIMEOUT_MS',
    required: false,
    origin: 'shared',
    description: '게시 완료 대기 한도. 초과는 실패가 아니라 pending',
  },
  {
    key: 'SNS_MOCK',
    required: false,
    origin: 'local',
    description: 'true 면 인스타·틱톡을 강제 mock',
  },

  // ── API 서버 ─────────────────────────────────────────
  {
    key: 'NODE_ENV',
    required: false,
    origin: 'shared',
    description:
      "'development' 일 때만 Swagger·개발 로그인이 열린다. 운영은 'production' 을 반드시 주입",
  },
  {
    key: 'API_PORT',
    required: false,
    origin: 'shared',
    description: '기본 3000. 로컬에서 점유됐다면 이 값만 바꾼다',
  },
  {
    key: 'API_HOST',
    required: false,
    origin: 'shared',
    description: 'bind 주소. 기본 0.0.0.0',
  },
  {
    key: 'API_BASE_URL',
    required: false,
    origin: 'local',
    description: 'scripts/media-e2e.mjs 가 찌를 서버 주소',
  },
  {
    key: 'ENABLE_DOCS',
    required: false,
    origin: 'production',
    description: "true 면 운영에서도 Swagger 를 연다. 개발 로그인은 여전히 닫힌다",
  },
  {
    key: 'LOG_LEVEL',
    required: false,
    origin: 'shared',
    description: 'Fastify 로그 레벨',
  },
  {
    key: 'SNS_TOKEN_ENCRYPTION_KEY',
    required: false,
    origin: 'shared',
    description: 'SNS access_token 암호화 키(32바이트). 운영에서 기본값을 쓰면 안 된다',
  },
  {
    key: 'APP_DEEPLINK_SCHEME',
    required: false,
    origin: 'shared',
    description: 'OAuth·결제 완료 후 앱으로 돌아가는 스킴. 기본 snaply://',
  },
  {
    key: 'RATE_LIMIT_GLOBAL_MAX',
    required: false,
    origin: 'shared',
    description: '전역 IP당 분당 요청 수. /billing/webhook 은 제외',
  },

  // ── 공개 페이지 / 플랫폼 검증 ────────────────────────
  {
    key: 'LEGAL_CONTACT_EMAIL',
    required: false,
    origin: 'shared',
    description: '약관·개인정보처리방침 페이지에 표시되는 문의처',
  },
  {
    key: 'SITE_VERIFICATION_META',
    required: false,
    origin: 'shared',
    description: '<head> 에 삽입할 메타 태그. name=content, 콤마로 여러 개',
  },
  {
    key: 'SITE_VERIFICATION_FILE_NAME',
    required: false,
    origin: 'shared',
    description: '루트에서 평문으로 서빙할 파일명',
  },
  {
    key: 'SITE_VERIFICATION_FILE_CONTENT',
    required: false,
    origin: 'shared',
    description: '위 파일에 들어갈 문자열',
  },

  // ── AI 워커 ──────────────────────────────────────────
  {
    key: 'AI_WORKER_PORT',
    required: false,
    origin: 'shared',
    description: '워커 헬스 포트',
  },
  {
    key: 'WHISPER_MODEL',
    required: false,
    origin: 'shared',
    description: 'faster-whisper 모델 크기. 기본 small',
  },
  {
    key: 'EDIT_TIMEOUT_SECONDS',
    required: false,
    origin: 'shared',
    description: '편집 작업 1건의 타임아웃',
  },
  {
    key: 'BGM_DIR',
    required: false,
    origin: 'shared',
    description: 'BGM 음원 디렉터리. 컨테이너는 Dockerfile 에서 주입',
  },

  // ── Sentry ───────────────────────────────────────────
  {
    key: 'SENTRY_DSN',
    required: false,
    origin: 'production',
    description: '미설정 시 캡처는 no-op. API·워커 공통',
  },
  {
    key: 'SENTRY_DEBUG',
    required: false,
    origin: 'local',
    description: 'true 면 전송 로그를 남긴다',
  },

  // ── 로컬 e2e 스크립트 ────────────────────────────────
  {
    key: 'TEST_EMAIL',
    required: false,
    origin: 'local',
    description: 'scripts/media-e2e.mjs 가 로그인할 계정',
  },
  {
    key: 'TEST_PASSWORD',
    required: false,
    origin: 'local',
    description: '위 계정의 비밀번호',
  },
] as const satisfies readonly EnvVarSpec[];

/** `requireEnv` 가 받을 수 있는 키 — 스펙에서 required 로 선언한 것만. */
export type RequiredEnvKey = Extract<(typeof ENV_VARS)[number], { required: true }>['key'];
