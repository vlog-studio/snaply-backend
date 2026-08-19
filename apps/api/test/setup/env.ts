/**
 * 테스트 실행 전 환경변수를 고정한다.
 *
 * 주의: Vitest 는 `apps/api/.env` 를 process.env 에 자동으로 주입한다.
 * 그래서 값을 채워 넣는 것만으로는 부족하고, 외부 서비스 크리덴셜은 **명시적으로 지워야** 한다.
 * (예: 개발용 .env 에 REVENUECAT_API_KEY 를 넣는 순간 모든 결제 테스트가 실키 모드로 바뀐다.)
 * 실키 경로를 검증하는 테스트는 harness(env) 로 그때만 주입한다.
 *
 * SUPABASE_URL 만은 auth 스텁 포트가 동적이라 harness 에서 주입한다.
 */
import { TEST_DATABASE_URL, TEST_REDIS_URL, TEST_S3_ENDPOINT } from './constants.js';
import { clearExternalCredentials } from './hermetic.js';

clearExternalCredentials();

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;

process.env.REDIS_URL = TEST_REDIS_URL;
process.env.EDIT_QUEUE_NAME = 'edit-jobs-test';
process.env.VIDEO_ANALYSIS_QUEUE_NAME = 'video-analysis-test';

process.env.AWS_ACCESS_KEY_ID = 'minioadmin';
process.env.AWS_SECRET_ACCESS_KEY = 'minioadmin123';
process.env.AWS_REGION = 'ap-northeast-2';
process.env.S3_BUCKET_NAME = 'snaply-test';
process.env.S3_ENDPOINT = TEST_S3_ENDPOINT;
// 개인 .env 의 공개 주소(LAN IP 등)가 새면 presigned URL 이 테스트에서 접속 불가능해진다.
// 테스트는 같은 호스트의 MinIO 를 직접 친다.
process.env.S3_PUBLIC_ENDPOINT = TEST_S3_ENDPOINT;
// delete 는 dotenv 재로딩으로 되살아난다(위 TIKTOK 주석 참고). config 는 빈 문자열을 미설정으로 본다.
process.env.CLOUDFRONT_DOMAIN = '';

// 외부 연동은 기본적으로 mock/dry-run. 개별 테스트가 필요 시 덮어쓴다.
process.env.SNS_TOKEN_ENCRYPTION_KEY = 'test-encryption-key-do-not-use-in-prod';
process.env.APP_DEEPLINK_SCHEME = 'snaply://';
// 플랫폼 처리 대기 폴링을 테스트에서 빠르게 돌리기 위한 값
process.env.INSTAGRAM_POLL_INTERVAL_MS = '10';
process.env.INSTAGRAM_POLL_TIMEOUT_MS = '2000';
// 호출 시점에 읽히는 값이라 "지우기"로는 개인 .env 오염을 막을 수 없다(dotenv 가 되살림).
// 값을 명시적으로 박아둔다 — 개별 테스트가 필요하면 직접 덮어쓴다.
process.env.TIKTOK_SCOPES = 'user.info.basic,video.publish';
process.env.TIKTOK_POLL_INTERVAL_MS = '10';
process.env.TIKTOK_POLL_TIMEOUT_MS = '2000';

// 웹훅 인증 값. mock 모드에서도 그대로 검증되므로 테스트는 이 값을 헤더에 실어 보낸다.
process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN = 'test-webhook-token';
