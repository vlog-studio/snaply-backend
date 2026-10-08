import assert from 'node:assert/strict';
import test from 'node:test';
import { createDownloadUrl, initStorage } from '../dist/services/storage.service.js';

const TEST_CONFIG = {
  region: 'ap-northeast-2',
  bucket: 'snaply-test',
  credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' },
  endpoint: 'http://internal-minio:9000',
  publicEndpoint: 'http://public-minio:9200',
  forcePathStyle: true,
  publicBaseUrl: 'http://public-minio:9200/snaply-test',
  presignExpirySeconds: 900,
  downloadUrlExpirySeconds: 3600,
  maxUploadBytes: 500 * 1024 * 1024,
};

test('createDownloadUrl signs a client-reachable private object URL', async () => {
  initStorage(TEST_CONFIG);

  const signedUrl = new URL(await createDownloadUrl('uploads/user-id/video-id.mp4'));

  assert.equal(signedUrl.origin, 'http://public-minio:9200');
  assert.equal(signedUrl.pathname, '/snaply-test/uploads/user-id/video-id.mp4');
  assert.equal(signedUrl.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(signedUrl.searchParams.get('X-Amz-Expires'), '3600');
  assert.ok(signedUrl.searchParams.has('X-Amz-Signature'));
});

// AWS 서버는 키 없이 인스턴스 역할로 붙는다. 여기서는 기본 체인의 첫 단계(환경변수)에 임시
// 자격증명을 두어, 정적 키가 없을 때 SDK 가 체인에서 받은 자격증명으로 서명하는지 본다.
test('without static keys, createDownloadUrl signs with the SDK default chain on AWS S3', async (t) => {
  const keys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  // AWS_PROFILE 이 있으면 SDK 가 환경변수 단계를 건너뛴다.
  delete process.env.AWS_PROFILE;
  process.env.AWS_ACCESS_KEY_ID = 'ASIATESTROLEKEY';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-role-secret';
  process.env.AWS_SESSION_TOKEN = 'test-role-session';

  initStorage({
    ...TEST_CONFIG,
    credentials: undefined,
    endpoint: undefined,
    publicEndpoint: undefined,
    forcePathStyle: false,
    publicBaseUrl: 'https://snaply-test.s3.amazonaws.com',
  });

  const signedUrl = new URL(await createDownloadUrl('uploads/user-id/video-id.mp4'));

  assert.equal(signedUrl.origin, 'https://snaply-test.s3.ap-northeast-2.amazonaws.com');
  assert.equal(signedUrl.pathname, '/uploads/user-id/video-id.mp4');
  assert.match(signedUrl.searchParams.get('X-Amz-Credential') ?? '', /^ASIATESTROLEKEY\//);
  // 임시 자격증명(인스턴스 역할)은 세션 토큰이 URL 에 함께 실린다.
  assert.equal(signedUrl.searchParams.get('X-Amz-Security-Token'), 'test-role-session');
});
