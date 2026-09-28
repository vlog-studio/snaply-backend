/**
 * 앱이 스냅을 기기 사이에 맞추는 데 쓰는 영상 API — 목록·등록·상태 조회.
 *
 * 앱의 reconcile 은 목록을 끝 페이지까지 읽어 "서버에 무엇이 있는가"를 알고, 목록에서 사라진
 * 스냅은 `POST /videos/lookup` 으로 이유를 묻는다(docs/decisions/snap-sync-across-devices.md §동기화 설계). 그래서
 * 여기서 고정하는 것은 셋이다:
 *   ① 목록은 페이지를 넘겨도 빠지거나 겹치는 항목이 없다 — 빠지면 앱이 그 스냅을 "없다"고 본다
 *   ② 목록 항목만으로 다른 기기가 스냅을 그릴 수 있다 — 치수·만료 시각·앱이 붙인 이름
 *   ③ 상태 조회는 지워진 이유를 구분하고, 남의 영상은 존재조차 드러내지 않는다(SNAP-8)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cutoffFor, snapExpiresAt, SNAP_RETENTION_DAYS } from '../src/services/retention-policy.js';
import { findExpiredSnaps } from '../src/services/retention.service.js';
import { ensureBucketForDev } from '../src/services/storage.service.js';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
  // 등록 경로가 실제 MinIO 에 HEAD 를 보낸다
  await ensureBucketForDev();
});
afterAll(async () => {
  await h.close();
});

async function readySnap(
  user: TestUser,
  data: { createdAt?: Date; width?: number; height?: number; clientId?: string } = {},
): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
      ...data,
    },
  });
  return video.id;
}

async function listAll(user: TestUser, limit: number): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const query: string = new URLSearchParams({
      kind: 'source',
      limit: String(limit),
      ...(cursor ? { cursor } : {}),
    }).toString();
    const res = await h.app.inject({ method: 'GET', url: `/videos?${query}`, headers: user.auth });
    expect(res.statusCode).toBe(200);
    const page = res.json().data as { items: { id: string }[]; nextCursor: string | null };
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

function lookup(user: TestUser, ids: string[]) {
  return h.app.inject({
    method: 'POST',
    url: '/videos/lookup',
    headers: user.auth,
    payload: { ids },
  });
}

describe('GET /videos — 끝까지 읽기', () => {
  it('같은 시각에 올라온 스냅도 페이지를 넘기며 한 번씩만 나온다', async () => {
    const user = await h.createUser();
    const sameMoment = new Date('2026-09-20T03:00:00.000Z');
    const ids = await Promise.all(
      Array.from({ length: 7 }, () => readySnap(user, { createdAt: sameMoment })),
    );

    const listed = await listAll(user, 2);

    expect([...listed].sort()).toEqual([...ids].sort());
  });
});

describe('GET /videos — 다른 기기가 그릴 수 있는 항목', () => {
  it('치수·앱이 붙인 이름·만료 시각이 함께 온다', async () => {
    const user = await h.createUser();
    const uploadedAt = cutoffFor(2);
    const id = await readySnap(user, {
      createdAt: uploadedAt,
      width: 720,
      height: 1280,
      clientId: 'snaply-1727400000000.mp4',
    });

    const res = await h.app.inject({ method: 'GET', url: '/videos?kind=source', headers: user.auth });
    const item = res.json().data.items.find((video: { id: string }) => video.id === id);

    expect(item).toMatchObject({
      width: 720,
      height: 1280,
      clientId: 'snaply-1727400000000.mp4',
      expiresAt: snapExpiresAt(uploadedAt).toISOString(),
    });
  });

  it('등록 전(pending)과 편집 결과물에는 만료 시각이 없다', async () => {
    const user = await h.createUser();
    const pending = await h.prisma.video.create({
      data: { userId: user.id, kind: 'source', status: 'pending' },
    });
    const result = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'done' },
    });

    const res = await h.app.inject({ method: 'GET', url: '/videos', headers: user.auth });
    const byId = new Map(
      res.json().data.items.map((video: { id: string; expiresAt: string | null }) => [
        video.id,
        video.expiresAt,
      ]),
    );

    expect(byId.get(pending.id)).toBeNull();
    expect(byId.get(result.id)).toBeNull();
  });

  it('만료 시각은 정리 배치의 기준과 같다 — 지난 스냅만 정리 대상이다', async () => {
    const user = await h.createUser();
    // 만료 시각이 1분 전인 스냅과 1분 뒤인 스냅
    const minuteAgo = new Date(Date.now() - 60_000);
    const minuteAhead = new Date(Date.now() + 60_000);
    const past = await readySnap(user, { createdAt: cutoffFor(SNAP_RETENTION_DAYS, minuteAgo) });
    const ahead = await readySnap(user, { createdAt: cutoffFor(SNAP_RETENTION_DAYS, minuteAhead) });

    const expired = (await findExpiredSnaps()).map((candidate) => candidate.id);
    const rows = await h.prisma.video.findMany({ where: { id: { in: [past, ahead] } } });
    const expiresAt = new Map(rows.map((row) => [row.id, snapExpiresAt(row.createdAt).getTime()]));

    expect(expiresAt.get(past)).toBeLessThanOrEqual(Date.now());
    expect(expired).toContain(past);
    expect(expiresAt.get(ahead)).toBeGreaterThan(Date.now());
    expect(expired).not.toContain(ahead);
  });
});

describe('POST /videos — 앱이 붙인 이름', () => {
  it('등록할 때 보낸 clientId 가 목록으로 돌아온다', async () => {
    const user = await h.createUser();
    const target = await h.app.inject({
      method: 'GET',
      url: '/videos/upload-url?filename=snaply-1.mp4&contentType=video%2Fmp4',
      headers: user.auth,
    });
    const { videoId, uploadUrl } = target.json().data;
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: Buffer.from('bytes'),
    });
    expect(put.ok).toBe(true);

    const res = await h.app.inject({
      method: 'POST',
      url: '/videos',
      headers: user.auth,
      payload: { videoId, durationSeconds: 3, clientId: 'snaply-1.mp4' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.clientId).toBe('snaply-1.mp4');
    const listed = await h.app.inject({ method: 'GET', url: '/videos?kind=source', headers: user.auth });
    expect(listed.json().data.items[0]).toMatchObject({ id: videoId, clientId: 'snaply-1.mp4' });
  });
});

describe('POST /videos/lookup', () => {
  it('있는 스냅, 사용자가 지운 스냅, 만료된 스냅을 구분한다', async () => {
    const user = await h.createUser();
    const live = await readySnap(user);
    const deleted = await readySnap(user);
    const expired = await readySnap(user);
    await h.app.inject({ method: 'DELETE', url: `/videos/${deleted}`, headers: user.auth });
    await h.prisma.video.update({
      where: { id: expired },
      data: { deletedAt: new Date(), removalReason: 'expired', purgedAt: new Date() },
    });

    const res = await lookup(user, [live, deleted, expired]);

    expect(res.statusCode).toBe(200);
    const byId = new Map(
      res.json().data.items.map((item: { id: string }) => [item.id, item] as const),
    );
    expect(byId.get(live)).toEqual({ id: live, state: 'live', removalReason: null, removedAt: null });
    expect(byId.get(deleted)).toMatchObject({ state: 'removed', removalReason: 'user' });
    expect(byId.get(expired)).toMatchObject({ state: 'removed', removalReason: 'expired' });
  });

  it('사유가 기록되기 전에 지워진 스냅은 사용자가 지운 것으로 읽는다', async () => {
    const user = await h.createUser();
    const legacy = await readySnap(user);
    await h.prisma.video.update({ where: { id: legacy }, data: { deletedAt: new Date() } });

    const res = await lookup(user, [legacy]);

    expect(res.json().data.items).toEqual([
      expect.objectContaining({ id: legacy, state: 'removed', removalReason: 'user' }),
    ]);
  });

  it('남의 스냅과 없는 id 는 똑같이 응답에서 빠진다', async () => {
    const owner = await h.createUser();
    const other = await h.createUser();
    const theirs = await readySnap(owner);

    const res = await lookup(other, [theirs, crypto.randomUUID()]);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toEqual([]);
  });

  it('한 번에 묻는 id 수에 상한이 있다', async () => {
    const user = await h.createUser();

    const res = await lookup(
      user,
      Array.from({ length: 101 }, () => crypto.randomUUID()),
    );

    expect(res.statusCode).toBe(400);
  });
});
