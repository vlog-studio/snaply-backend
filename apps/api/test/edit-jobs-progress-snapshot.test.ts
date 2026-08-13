/**
 * 진행률 WebSocket의 done 스냅샷 계약 — 완료 후 (재)연결해도 실시간 완료 메시지와
 * 동일하게 outputUrl을 받아야 한다 (docs/api-spec.md WebSocket 절).
 * WS 왕복 대신 스냅샷이 사용하는 getEditJobOutputUrl의 URL 해석을 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from './helpers/harness.js';
import { getEditJobOutputUrl } from '../src/services/edit-job.service.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('getEditJobOutputUrl', () => {
  it('editedS3Key가 있으면 presigned URL을 만든다', async () => {
    const user = await h.createUser();
    const video = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'done', editedS3Key: 'results/test.mp4' },
    });
    const url = await getEditJobOutputUrl(video.id);
    expect(url).toContain('results/test.mp4');
  });

  it('editedS3Key가 없으면 구버전 editedUrl을 그대로 돌려준다', async () => {
    const user = await h.createUser();
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        kind: 'result',
        status: 'done',
        editedUrl: 'https://cdn.example.com/legacy.mp4',
      },
    });
    await expect(getEditJobOutputUrl(video.id)).resolves.toBe(
      'https://cdn.example.com/legacy.mp4',
    );
  });

  it('결과물 URL이 아직 없으면 null', async () => {
    const user = await h.createUser();
    const video = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'processing' },
    });
    await expect(getEditJobOutputUrl(video.id)).resolves.toBeNull();
  });

  it('없는 videoId는 null', async () => {
    await expect(
      getEditJobOutputUrl('00000000-0000-0000-0000-000000000000'),
    ).resolves.toBeNull();
  });
});
