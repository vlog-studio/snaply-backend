/**
 * 고아 pending 영상 정리 배치 — presigned URL 만 발급되고 확정되지 않은 레코드 회수.
 * 배경: docs/decisions/snap-source-of-truth.md §5 GC 병행 항목 ①
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from './helpers/harness.js';
import {
  PENDING_VIDEO_TTL_HOURS,
  purgeStalePendingVideos,
} from '../src/services/video.service.js';
import {
  createUploadUrl,
  ensureBucketForDev,
  getObjectSize,
} from '../src/services/storage.service.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
  // S3 객체 삭제가 실제 MinIO 를 치므로 버킷이 있어야 한다
  await ensureBucketForDev();
});
afterAll(async () => {
  await h.close();
});

const HOUR_MS = 60 * 60 * 1000;
const STALE_AT = new Date(Date.now() - (PENDING_VIDEO_TTL_HOURS + 1) * HOUR_MS);

describe('purgeStalePendingVideos', () => {
  it('TTL 이 지난 미확정 pending 만 삭제한다', async () => {
    const user = await h.createUser();

    const stale = await h.prisma.video.create({
      data: { userId: user.id, kind: 'source', status: 'pending', createdAt: STALE_AT },
    });
    const fresh = await h.prisma.video.create({
      data: { userId: user.id, kind: 'source', status: 'pending' },
    });
    const ready = await h.prisma.video.create({
      data: { userId: user.id, kind: 'source', status: 'ready', createdAt: STALE_AT },
    });
    const result = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'processing', createdAt: STALE_AT },
    });

    const outcome = await purgeStalePendingVideos();

    expect(outcome.purged).toEqual([stale.id]);
    expect(outcome.failed).toEqual([]);
    expect(await h.prisma.video.findUnique({ where: { id: stale.id } })).toBeNull();

    // 발급 직후·확정 완료·편집 결과물은 남는다
    for (const survivor of [fresh.id, ready.id, result.id]) {
      expect(await h.prisma.video.findUnique({ where: { id: survivor } })).not.toBeNull();
    }
  });

  it('업로드만 하고 confirm 을 안 한 S3 객체도 함께 지운다', async () => {
    const user = await h.createUser();
    const video = await h.prisma.video.create({
      data: { userId: user.id, kind: 'source', status: 'pending', createdAt: STALE_AT },
    });

    const { uploadUrl, s3Key } = await createUploadUrl({
      userId: user.id,
      videoId: video.id,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    });
    await h.prisma.video.update({ where: { id: video.id }, data: { s3Key } });

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: Buffer.from('fake-video-bytes'),
    });
    expect(put.ok).toBe(true);
    expect(await getObjectSize(s3Key)).not.toBeNull();

    const outcome = await purgeStalePendingVideos();

    expect(outcome.purged).toEqual([video.id]);
    expect(await h.prisma.video.findUnique({ where: { id: video.id } })).toBeNull();
    expect(await getObjectSize(s3Key)).toBeNull();
  });
});
