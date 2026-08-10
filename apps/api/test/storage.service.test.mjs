import assert from 'node:assert/strict';
import test from 'node:test';
import { createDownloadUrl, initStorage } from '../dist/services/storage.service.js';

const TEST_CONFIG = {
  region: 'ap-northeast-2',
  bucket: 'snaply-test',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
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
