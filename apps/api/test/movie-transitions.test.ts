/**
 * 무비의 경계별 전환(specs/movie.md MOV-22).
 *
 * 고정하는 계약:
 *   ① 마지막을 뺀 모든 컷이 다음 컷으로의 전환을 갖고, 고른 쪽(`owner`)이 남는다
 *   ② 사용자가 보내지 않은 경계는 AI 가 고른다 — 지금은 스타일 기본값이다(감성 = crossfade 800ms)
 *   ③ AI 경계는 스타일을 따라가고, 사용자 경계는 그대로다
 *   ④ 사용자 전환은 보낸 배열에서 이어진 두 컷의 것이다 — `ai` 정렬로 떨어지면 AI 에게 돌아간다
 *   ⑤ 사전에 맞지 않는 값은 고쳐 받지 않고 400 이다
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
  transition: { kind: string; durationMs?: number; owner: string } | null;
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

function transitions(res: { json: () => { data: { clips: ClipDto[] } } }) {
  return res.json().data.clips.map((clip) => clip.transition);
}

describe('경계마다 전환이 있다', () => {
  it('마지막을 뺀 컷이 AI 가 고른 전환을 갖고, 일상은 바로 넘긴다', async () => {
    const user = await h.createUser();
    const [a, b, c] = [await createSnap(user), await createSnap(user), await createSnap(user)];

    const res = await createMovie(user, { clips: [{ videoId: a }, { videoId: b }, { videoId: c }] });

    expect(res.statusCode).toBe(201);
    expect(transitions(res)).toEqual([
      { kind: 'hardcut', owner: 'ai' },
      { kind: 'hardcut', owner: 'ai' },
      null,
    ]);
  });

  it('감성은 지금 렌더와 같은 0.8초 crossfade 로 시작한다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];

    const res = await createMovie(user, { stylePreset: '감성', clips: [{ videoId: a }, { videoId: b }] });

    expect(transitions(res)).toEqual([{ kind: 'crossfade', durationMs: 800, owner: 'ai' }, null]);
  });

  it('컷이 하나면 전환이 없다', async () => {
    const user = await h.createUser();
    const res = await createMovie(user, { clips: [{ videoId: await createSnap(user) }] });
    expect(transitions(res)).toEqual([null]);
  });
});

describe('사용자가 고른 전환', () => {
  it('보낸 경계는 user 가 되고, 길이를 생략하면 기본 길이다', async () => {
    const user = await h.createUser();
    const [a, b, c] = [await createSnap(user), await createSnap(user), await createSnap(user)];

    const res = await createMovie(user, {
      clips: [{ videoId: a, transition: { kind: 'dip' } }, { videoId: b }, { videoId: c }],
    });

    expect(res.statusCode).toBe(201);
    expect(transitions(res)).toEqual([
      { kind: 'dip', durationMs: 400, owner: 'user' },
      { kind: 'hardcut', owner: 'ai' },
      null,
    ]);
  });

  it('GET 으로 다시 읽어도 같다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const created = await createMovie(user, {
      clips: [{ videoId: a, transition: { kind: 'crossfade', durationMs: 300 } }, { videoId: b }],
    });

    const res = await h.app.inject({
      method: 'GET',
      url: `/movies/${created.json().data.id}`,
      headers: user.auth,
    });

    expect(transitions(res)).toEqual([{ kind: 'crossfade', durationMs: 300, owner: 'user' }, null]);
  });

  it('사용자가 hardcut 을 고를 수도 있다 — AI 의 hardcut 과 owner 로 구별된다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];

    const res = await createMovie(user, {
      stylePreset: '감성',
      clips: [{ videoId: a, transition: { kind: 'hardcut' } }, { videoId: b }],
    });

    expect(transitions(res)).toEqual([{ kind: 'hardcut', owner: 'user' }, null]);
  });
});

describe('잘못된 전환은 400', () => {
  async function attempt(transition: Record<string, unknown>, onLast = false) {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const clips = onLast
      ? [{ videoId: a }, { videoId: b, transition }]
      : [{ videoId: a, transition }, { videoId: b }];
    return createMovie(user, { clips });
  }

  it('마지막 컷에 보낸 전환', async () => {
    expect((await attempt({ kind: 'dip' }, true)).statusCode).toBe(400);
  });

  it('범위 밖 길이는 고쳐 받지 않는다', async () => {
    expect((await attempt({ kind: 'crossfade', durationMs: 199 })).statusCode).toBe(400);
    expect((await attempt({ kind: 'crossfade', durationMs: 801 })).statusCode).toBe(400);
  });

  it('hardcut 에 길이를 주거나 모르는 종류를 보낸 경우', async () => {
    expect((await attempt({ kind: 'hardcut', durationMs: 300 })).statusCode).toBe(400);
    expect((await attempt({ kind: 'whip', durationMs: 300 })).statusCode).toBe(400);
  });
});

describe('스타일을 바꾸면', () => {
  it('AI 경계는 스타일을 따라가고 사용자 경계는 그대로다', async () => {
    const user = await h.createUser();
    const [a, b, c] = [await createSnap(user), await createSnap(user), await createSnap(user)];
    const created = await createMovie(user, {
      clips: [{ videoId: a, transition: { kind: 'flash' } }, { videoId: b }, { videoId: c }],
    });

    const res = await patchMovie(user, created.json().data.id, { stylePreset: '감성' });

    expect(res.statusCode).toBe(200);
    expect(transitions(res)).toEqual([
      { kind: 'flash', durationMs: 200, owner: 'user' },
      { kind: 'crossfade', durationMs: 800, owner: 'ai' },
      null,
    ]);
  });

  it('스타일이 그대로면 컷을 다시 쓰지 않는다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const created = await createMovie(user, { clips: [{ videoId: a }, { videoId: b }] });
    const before = await h.prisma.movieClip.findMany({ where: { movieId: created.json().data.id } });

    await patchMovie(user, created.json().data.id, { stylePreset: '일상', title: '이름만' });

    const after = await h.prisma.movieClip.findMany({ where: { movieId: created.json().data.id } });
    expect(after.map((clip) => clip.id).sort()).toEqual(before.map((clip) => clip.id).sort());
  });
});

describe('컷을 다시 보내면', () => {
  it('보내지 않은 경계는 AI 에게 돌아간다 — 앱은 user 경계를 다시 보내야 한다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const created = await createMovie(user, {
      clips: [{ videoId: a, transition: { kind: 'dip' } }, { videoId: b }],
    });

    const res = await patchMovie(user, created.json().data.id, { clips: [{ videoId: a }, { videoId: b }] });

    expect(transitions(res)).toEqual([{ kind: 'hardcut', owner: 'ai' }, null]);
  });

  it('arranger ai 정렬로 두 컷이 떨어지면 그 전환은 AI 에게 돌아간다', async () => {
    const user = await h.createUser();
    const early = await createSnap(user, new Date('2026-01-01T00:00:00Z'));
    const middle = await createSnap(user, new Date('2026-02-01T00:00:00Z'));
    const late = await createSnap(user, new Date('2026-03-01T00:00:00Z'));

    // 보낸 순서: late → early → middle. late→early 는 정렬 뒤 떨어지고, early→middle 은 이어진 채 남는다.
    const res = await createMovie(user, {
      arranger: 'ai',
      clips: [
        { videoId: late, transition: { kind: 'flash' } },
        { videoId: early, transition: { kind: 'dip' } },
        { videoId: middle },
      ],
    });

    expect(res.json().data.clips.map((clip: ClipDto) => clip.videoId)).toEqual([early, middle, late]);
    expect(transitions(res)).toEqual([
      { kind: 'dip', durationMs: 400, owner: 'user' },
      { kind: 'hardcut', owner: 'ai' },
      null,
    ]);
  });
});
