/**
 * 편집 작업 취소 (DELETE /edit-jobs/:id) — 최종 상태 'canceled' 계약.
 * 배경: FE 안건 "생성 중 취소" — 취소 API + 취소된 작업의 최종 상태 정의.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function createJob(
  user: TestUser,
  status: 'queued' | 'processing' | 'done' | 'failed' | 'canceled',
): Promise<{ jobId: string; videoId: string }> {
  const video = await h.prisma.video.create({
    data: { userId: user.id, kind: 'result', status: 'processing' },
  });
  const job = await h.prisma.editJob.create({
    data: { userId: user.id, videoId: video.id, status },
  });
  return { jobId: job.id, videoId: video.id };
}

describe('DELETE /edit-jobs/:id', () => {
  it('대기 중(queued) 작업을 canceled로 바꾸고 결과물 video를 정리한다', async () => {
    const user = await h.createUser();
    const { jobId, videoId } = await createJob(user, 'queued');

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/edit-jobs/${jobId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.canceled).toBe(true);

    const job = await h.prisma.editJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('canceled');
    expect(job?.completedAt).not.toBeNull();

    // 결과물 video는 목록에서 사라진다 (소프트 삭제 + failed)
    const video = await h.prisma.video.findUnique({ where: { id: videoId } });
    expect(video?.deletedAt).not.toBeNull();
    expect(video?.status).toBe('failed');
  });

  it('처리 중(processing) 작업도 취소할 수 있다', async () => {
    const user = await h.createUser();
    const { jobId } = await createJob(user, 'processing');

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/edit-jobs/${jobId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);

    const job = await h.prisma.editJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('canceled');
  });

  it('이미 취소된 작업의 재취소는 멱등하게 200이다', async () => {
    const user = await h.createUser();
    const { jobId } = await createJob(user, 'canceled');

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/edit-jobs/${jobId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.canceled).toBe(true);
  });

  it('done/failed로 끝난 작업은 409 CONFLICT', async () => {
    const user = await h.createUser();
    for (const status of ['done', 'failed'] as const) {
      const { jobId } = await createJob(user, status);
      const res = await h.app.inject({
        method: 'DELETE',
        url: `/edit-jobs/${jobId}`,
        headers: user.auth,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');

      // 상태는 그대로다
      const job = await h.prisma.editJob.findUnique({ where: { id: jobId } });
      expect(job?.status).toBe(status);
    }
  });

  it('남의 작업은 404 (존재 여부를 숨긴다)', async () => {
    const owner = await h.createUser();
    const attacker = await h.createUser();
    const { jobId } = await createJob(owner, 'queued');

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/edit-jobs/${jobId}`,
      headers: attacker.auth,
    });
    expect(res.statusCode).toBe(404);

    const job = await h.prisma.editJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('queued');
  });
});

describe('GET /edit-jobs/:id — canceled/errorCode 노출', () => {
  it('취소된 작업 조회는 status canceled를 반환한다', async () => {
    const user = await h.createUser();
    const { jobId } = await createJob(user, 'queued');
    await h.app.inject({ method: 'DELETE', url: `/edit-jobs/${jobId}`, headers: user.auth });

    const res = await h.app.inject({
      method: 'GET',
      url: `/edit-jobs/${jobId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('canceled');
    expect(res.json().data.errorCode).toBeNull();
  });

  it('실패한 작업은 errorCode 분류 코드를 함께 반환한다', async () => {
    const user = await h.createUser();
    const video = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'failed' },
    });
    const job = await h.prisma.editJob.create({
      data: {
        userId: user.id,
        videoId: video.id,
        status: 'failed',
        errorMessage: '편집 시간이 초과되었습니다.',
        errorCode: 'TIMEOUT',
      },
    });

    const res = await h.app.inject({
      method: 'GET',
      url: `/edit-jobs/${job.id}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('failed');
    expect(res.json().data.errorCode).toBe('TIMEOUT');
  });
});
