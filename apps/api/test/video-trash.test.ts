/**
 * 최근 삭제(휴지통) — 지운 스냅은 원래 보관 기간이 끝날 때까지 되살릴 수 있다(SNAP-20).
 *
 * 결정: docs/decisions/snap-trash.md. 여기서 고정하는 것:
 *   ① 서버에 사본이 있던 스냅만 휴지통에 간다 — 올라가는 중인 스냅 · 보관 기간이 끝난 스냅은 되돌릴 수 없다
 *   ② 휴지통의 스냅은 목록 · 상세에서 사라지고, 다른 기기에는 지금처럼 `removed` 로 보인다(새 상태를 만들면 예전 앱이
 *      스냅을 잘못 다룬다)
 *   ③ 되살리면 목록에 돌아오고, 보관 기간이 지났거나 파일을 남기지 않고 지운 행은 되살리지 않는다
 *   ④ 지우면 휴지통에 가든 아니든 분석 결과는 바로 파기한다(ANA-3 — 개인정보처리방침의 고지)
 */
import { Queue, Worker } from 'bullmq';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRedisConnection } from '../src/lib/redis.js';
import { SNAP_RETENTION_DAYS, cutoffFor, snapExpiresAt } from '../src/services/retention-policy.js';
import { ANALYSIS_VERSION } from '../src/services/video-analysis.service.js';
import { ensureBucketForDev } from '../src/services/storage.service.js';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
  // 휴지통에 가지 않는 삭제는 MinIO 에 DeleteObject 를 보낸다.
  await ensureBucketForDev();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

async function snap(
  user: TestUser,
  data: { createdAt?: Date; status?: string; renditionStatus?: string; clientId?: string } = {},
): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: data.status ?? 'ready',
      renditionStatus: data.renditionStatus ?? 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      ...(data.clientId ? { clientId: data.clientId } : {}),
    },
  });
  return video.id;
}

function del(user: TestUser, id: string) {
  return h.app.inject({ method: 'DELETE', url: `/videos/${id}`, headers: user.auth });
}
function trash(user: TestUser) {
  return h.app.inject({ method: 'GET', url: '/videos/trash', headers: user.auth });
}
function restore(user: TestUser, id: string) {
  return h.app.inject({ method: 'POST', url: `/videos/${id}/restore`, headers: user.auth });
}
async function listedIds(user: TestUser): Promise<string[]> {
  const res = await h.app.inject({ method: 'GET', url: '/videos?kind=source', headers: user.auth });
  return res.json().data.items.map((item: { id: string }) => item.id);
}

describe('DELETE /videos/:id — 휴지통에 보내기', () => {
  it('올라간 스냅은 원래 보관 기간이 끝나는 때까지 되살릴 수 있다고 답한다', async () => {
    const user = await h.createUser();
    const createdAt = cutoffFor(3);
    const id = await snap(user, { createdAt });

    const res = await del(user, id);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      deleted: true,
      restorableUntil: snapExpiresAt(createdAt).toISOString(),
    });
    expect(await listedIds(user)).not.toContain(id);
    expect((await h.app.inject({ method: 'GET', url: `/videos/${id}`, headers: user.auth })).statusCode).toBe(404);
  });

  it('다른 기기에는 지금처럼 사용자가 지운 스냅으로 보인다 — 그 기기는 자기 원본을 지운다', async () => {
    const user = await h.createUser();
    const id = await snap(user);
    await del(user, id);

    const res = await h.app.inject({
      method: 'POST',
      url: '/videos/lookup',
      headers: user.auth,
      payload: { ids: [id] },
    });

    expect(res.json().data.items[0]).toMatchObject({ id, state: 'removed', removalReason: 'user' });
  });

  it.each([
    ['올라가는 중인 스냅', { status: 'pending' }],
    ['보관 기간이 끝난 스냅', { createdAt: cutoffFor(SNAP_RETENTION_DAYS + 1) }],
  ])('%s은 되살릴 수 없다 — 서버에 사본이 없다', async (_label, data) => {
    const user = await h.createUser();
    const id = await snap(user, data);

    const res = await del(user, id);

    expect(res.json().data).toEqual({ deleted: true, restorableUntil: null });
    expect((await trash(user)).json().data.items).toEqual([]);
  });
});

/** 끝난 분석 결과 한 건. */
async function analyze(user: TestUser, videoId: string): Promise<void> {
  await h.prisma.videoAnalysis.create({
    data: {
      videoId,
      userId: user.id,
      analysisVersion: ANALYSIS_VERSION,
      status: 'done',
      summary: '카페에서 음료를 든 손',
      usableForEdit: true,
    },
  });
}

describe('DELETE /videos/:id — 분석 결과 파기(ANA-3)', () => {
  it('휴지통에 가는 스냅도 분석 결과는 바로 지운다 — 남의 것과 다른 스냅의 결과는 그대로다', async () => {
    const user = await h.createUser();
    const other = await h.createUser();
    const id = await snap(user, { createdAt: cutoffFor(3) });
    const kept = await snap(user, { createdAt: cutoffFor(3) });
    const othersId = await snap(other, { createdAt: cutoffFor(3) });
    await analyze(user, id);
    await analyze(user, kept);
    await analyze(other, othersId);

    const res = await del(user, id);

    expect(res.json().data.restorableUntil).not.toBeNull();
    expect(await h.prisma.videoAnalysis.count({ where: { videoId: id } })).toBe(0);
    expect(await h.prisma.videoAnalysis.count({ where: { videoId: kept } })).toBe(1);
    expect(await h.prisma.videoAnalysis.count({ where: { videoId: othersId } })).toBe(1);
  });

  it('되돌릴 수 없는 삭제도 분석 결과를 지운다', async () => {
    const user = await h.createUser();
    const id = await snap(user, { createdAt: cutoffFor(SNAP_RETENTION_DAYS + 1) });
    await analyze(user, id);

    const res = await del(user, id);

    expect(res.json().data.restorableUntil).toBeNull();
    expect(await h.prisma.videoAnalysis.count({ where: { videoId: id } })).toBe(0);
  });

  it('되살린 스냅에는 지운 분석 결과가 돌아오지 않는다 — 필요해지면 다시 분석한다', async () => {
    const user = await h.createUser();
    const id = await snap(user, { createdAt: cutoffFor(3) });
    await analyze(user, id);

    await del(user, id);
    const res = await restore(user, id);

    expect(res.statusCode).toBe(200);
    expect(await h.prisma.videoAnalysis.count({ where: { videoId: id } })).toBe(0);
  });
});

describe('GET /videos/trash', () => {
  it('지운 순서로 최근 것부터, 되살릴 수 있는 스냅만 보인다', async () => {
    const user = await h.createUser();
    const first = await snap(user, { clientId: 'snaply-1.mp4' });
    const second = await snap(user);
    const live = await snap(user);
    await del(user, first);
    await del(user, second);
    // 이 변경 전에 지운 행 — 파일을 그 자리에서 지웠으므로 되살릴 것이 없다.
    const legacy = await snap(user);
    await h.prisma.video.update({
      where: { id: legacy },
      data: { deletedAt: new Date(), status: 'deleted', removalReason: 'user' },
    });

    const res = await trash(user);

    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.map((item: { id: string }) => item.id)).toEqual([second, first]);
    expect(items[1]).toMatchObject({ clientId: 'snaply-1.mp4' });
    expect(items.map((item: { id: string }) => item.id)).not.toContain(live);
  });

  it('보관 기간이 끝난 스냅은 정리 배치가 돌기 전이라도 보이지 않는다', async () => {
    const user = await h.createUser();
    const id = await snap(user, { createdAt: cutoffFor(5) });
    await del(user, id);
    // 지운 뒤 시간이 흘러 기간이 끝난 것처럼.
    await h.prisma.video.update({ where: { id }, data: { createdAt: cutoffFor(SNAP_RETENTION_DAYS + 1) } });

    expect((await trash(user)).json().data.items).toEqual([]);
  });

  it('남의 휴지통은 보이지 않는다', async () => {
    const [owner, stranger] = [await h.createUser(), await h.createUser()];
    await del(owner, await snap(owner));

    expect((await trash(stranger)).json().data.items).toEqual([]);
  });
});

describe('POST /videos/:id/restore', () => {
  it('되살리면 목록 · 상태 조회에 돌아오고 휴지통에서 빠진다', async () => {
    const user = await h.createUser();
    const id = await snap(user);
    await del(user, id);

    const res = await restore(user, id);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id, status: 'ready' });
    expect(await listedIds(user)).toContain(id);
    expect((await trash(user)).json().data.items).toEqual([]);
    const fate = await h.app.inject({
      method: 'POST',
      url: '/videos/lookup',
      headers: user.auth,
      payload: { ids: [id] },
    });
    expect(fate.json().data.items[0]).toMatchObject({ state: 'live', removalReason: null });
  });

  it('살아 있는 스냅이면 그대로 돌려준다 — 되돌리기를 두 번 눌러도 된다', async () => {
    const user = await h.createUser();
    const id = await snap(user);
    await del(user, id);
    await restore(user, id);

    const again = await restore(user, id);

    expect(again.statusCode).toBe(200);
    expect(again.json().data).toMatchObject({ id, status: 'ready' });
  });

  it.each([
    [
      '보관 기간이 끝난 스냅',
      async (id: string) => {
        await h.prisma.video.update({ where: { id }, data: { createdAt: cutoffFor(SNAP_RETENTION_DAYS + 1) } });
      },
    ],
    [
      '파일을 남기지 않고 지운 스냅(이 변경 전의 삭제)',
      async (id: string) => {
        await h.prisma.video.update({ where: { id }, data: { keptForRestore: false } });
      },
    ],
    [
      '정리 배치가 파일을 지운 스냅',
      async (id: string) => {
        await h.prisma.video.update({ where: { id }, data: { purgedAt: new Date() } });
      },
    ],
  ])('%s은 409 NOT_RESTORABLE 이다', async (_label, age) => {
    const user = await h.createUser();
    const id = await snap(user);
    await del(user, id);
    await age(id);

    const res = await restore(user, id);

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NOT_RESTORABLE');
    expect(await listedIds(user)).not.toContain(id);
  });

  it('남의 스냅은 404 다', async () => {
    const [owner, stranger] = [await h.createUser(), await h.createUser()];
    const id = await snap(owner);
    await del(owner, id);

    expect((await restore(stranger, id)).statusCode).toBe(404);
  });

  it('지운 동안 건너뛴 렌디션을 다시 적재한다', async () => {
    const user = await h.createUser();
    const id = await snap(user, { renditionStatus: 'pending' });
    await del(user, id);
    // 지운 동안 워커가 그 작업을 꺼내 "삭제된 영상"으로 건너뛰고 끝냈다 — 같은 job id 로 다시 넣으면 무시된다.
    const name = process.env.RENDITION_QUEUE_NAME ?? '';
    const queue = new Queue(name, { connection: createRedisConnection() });
    const worker = new Worker(name, null, { connection: createRedisConnection(), autorun: false });
    try {
      await queue.add('rendition', { videoId: id, userId: user.id, s3Key: 'k' }, { jobId: id, lifo: true });
      const token = crypto.randomUUID();
      const job = await worker.getNextJob(token);
      expect(job?.id).toBe(id);
      await job!.moveToCompleted({ videoId: id, status: 'skipped' }, token, false);

      await restore(user, id);

      expect(await (await queue.getJob(id))?.getState()).toBe('waiting');
    } finally {
      await (await queue.getJob(id))?.remove().catch(() => undefined);
      await worker.close();
      await queue.close();
    }
  });
});
