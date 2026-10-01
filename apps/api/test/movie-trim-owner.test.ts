/**
 * 컷 구간의 주인(specs/movie.md MOV-22).
 *
 * 고정하는 계약:
 *   ① 보내지 않으면 `user` 다 — 지금까지의 구간은 모두 사용자가 정한 것이고, AI 가 자르는 것은 초안(MOV-21)뿐이다
 *   ② `ai` 로 보낸 구간은 `ai` 로 남고 다시 읽어도 같다(스냅 전체도 주인이 있다)
 *   ③ 주인은 컷을 따라간다 — `arranger: ai` 정렬로 자리가 바뀌어도, 스타일만 바꿔 컷을 다시 저장해도
 *   ④ `PATCH` 로 컷을 다시 보낼 때 빠뜨리면 사용자 것이 된다
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

interface ClipDto {
  videoId: string;
  startMs?: number;
  endMs?: number;
  trimOwner: string;
}

async function createSnap(user: TestUser, capturedAt?: Date): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
      ...(capturedAt ? { capturedAt } : {}),
    },
  });
  return video.id;
}

function createMovie(user: TestUser, body: Record<string, unknown>) {
  return h.app.inject({ method: 'POST', url: '/movies', headers: user.auth, payload: body });
}

function patchMovie(user: TestUser, id: string, body: Record<string, unknown>) {
  return h.app.inject({ method: 'PATCH', url: `/movies/${id}`, headers: user.auth, payload: body });
}

function clipsOf(res: { json: () => { data: { clips: ClipDto[] } } }) {
  return res.json().data.clips;
}

describe('보내지 않은 구간의 주인', () => {
  it('자른 구간도 스냅 전체도 user 다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const res = await createMovie(user, {
      clips: [{ videoId: a, startMs: 200, endMs: 1800 }, { videoId: b }],
    });
    expect(res.statusCode).toBe(201);
    expect(clipsOf(res).map((clip) => clip.trimOwner)).toEqual(['user', 'user']);
  });
});

describe('초안이 자른 구간', () => {
  it('ai 로 보내면 ai 로 남고, GET 으로 다시 읽어도 같다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const created = await createMovie(user, {
      clips: [
        { videoId: a, startMs: 400, endMs: 2600, trimOwner: 'ai' },
        { videoId: b, trimOwner: 'ai' },
      ],
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;

    const read = await h.app.inject({ method: 'GET', url: `/movies/${id}`, headers: user.auth });
    expect(clipsOf(read)).toEqual([
      expect.objectContaining({ videoId: a, startMs: 400, endMs: 2600, trimOwner: 'ai' }),
      expect.objectContaining({ videoId: b, trimOwner: 'ai' }),
    ]);
    expect(clipsOf(read)[1]).not.toHaveProperty('startMs');
  });

  it('모르는 주인은 400 이다', async () => {
    const user = await h.createUser();
    const a = await createSnap(user);
    const res = await createMovie(user, { clips: [{ videoId: a, trimOwner: 'robot' }] });
    expect(res.statusCode).toBe(400);
  });
});

describe('주인은 컷을 따라간다', () => {
  it('arranger ai 정렬로 자리가 바뀌어도 — 사용자 전환이 떨어지는 컷도', async () => {
    const user = await h.createUser();
    const early = await createSnap(user, new Date('2026-10-01T09:00:00Z'));
    const late = await createSnap(user, new Date('2026-10-01T09:05:00Z'));
    const res = await createMovie(user, {
      arranger: 'ai',
      clips: [
        // 정렬로 뒤로 가면서 이 전환은 떨어진다 — 구간의 주인까지 떨어지면 안 된다.
        { videoId: late, startMs: 100, endMs: 900, trimOwner: 'ai', transition: { kind: 'dip' } },
        { videoId: early, startMs: 300, endMs: 1500 },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(clipsOf(res)).toEqual([
      expect.objectContaining({ videoId: early, trimOwner: 'user' }),
      expect.objectContaining({ videoId: late, startMs: 100, endMs: 900, trimOwner: 'ai' }),
    ]);
  });

  it('스타일만 바꿔 컷을 다시 저장해도', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const created = await createMovie(user, {
      clips: [{ videoId: a, startMs: 0, endMs: 1200, trimOwner: 'ai' }, { videoId: b }],
    });
    const id = created.json().data.id as string;

    const res = await patchMovie(user, id, { stylePreset: '감성' });
    expect(res.statusCode).toBe(200);
    expect(clipsOf(res).map((clip) => clip.trimOwner)).toEqual(['ai', 'user']);
  });
});

describe('컷을 다시 보내면', () => {
  it('빠뜨린 ai 는 user 가 된다 — 앱은 손대지 않은 ai 구간을 다시 보내야 한다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const created = await createMovie(user, {
      clips: [
        { videoId: a, startMs: 0, endMs: 1200, trimOwner: 'ai' },
        { videoId: b, startMs: 500, endMs: 2000, trimOwner: 'ai' },
      ],
    });
    const id = created.json().data.id as string;

    // 첫 컷은 사용자가 고쳤고(user), 둘째 컷은 그대로 다시 보냈다(ai).
    const res = await patchMovie(user, id, {
      clips: [
        { videoId: a, startMs: 200, endMs: 1200 },
        { videoId: b, startMs: 500, endMs: 2000, trimOwner: 'ai' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(clipsOf(res).map((clip) => clip.trimOwner)).toEqual(['user', 'ai']);
  });
});
