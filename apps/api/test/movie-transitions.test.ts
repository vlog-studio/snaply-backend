/**
 * 무비의 경계별 전환(specs/movie.md MOV-22).
 *
 * 고정하는 계약:
 *   ① 마지막을 뺀 모든 컷이 다음 컷으로의 전환을 갖고, 고른 쪽(`owner`)이 남는다
 *   ② 사용자가 보내지 않은 경계는 AI 가 고른다(`transition-director.ts` — 규칙 자체는 transition-director.test.ts)
 *   ③ AI 경계는 스타일을 따라가고, 사용자 경계는 그대로다
 *   ④ 사용자 전환은 보낸 배열에서 이어진 두 컷의 것이다 — `ai` 정렬로 떨어지면 AI 에게 돌아간다
 *   ⑤ 사전에 맞지 않는 값은 고쳐 받지 않고 400 이다
 *   ⑥ 생성은 editSpec v3 로 **edit-v3 큐에만** 간다 — 구버전 워커가 전환을 버리고 렌더하지 않게
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { createRedisConnection } from '../src/lib/redis.js';
import { pickTransitions } from '../src/services/transition-director.js';

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

/** AI 가 이 컷들 사이에 골랐어야 하는 전환 — 규칙 함수로 계산해 시드 운에 기대지 않는다. */
async function expectedAi(movieId: string, stylePreset: '감성' | '여행' | '일상', videoIds: string[]) {
  const snaps = await h.prisma.video.findMany({ where: { id: { in: videoIds } } });
  const timeOf = new Map(snaps.map((snap) => [snap.id, (snap.capturedAt ?? snap.createdAt).getTime()]));
  return pickTransitions({
    movieId,
    stylePreset,
    boundaries: videoIds.slice(0, -1).map((from, index) => ({
      fromVideoId: from,
      toVideoId: videoIds[index + 1]!,
      fromCapturedAt: timeOf.get(from)!,
      toCapturedAt: timeOf.get(videoIds[index + 1]!)!,
    })),
  }).map((transition) => ({ ...transition, owner: 'ai' }));
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

  it('보내지 않은 경계는 AI 규칙이 고른 값이다', async () => {
    const user = await h.createUser();
    const [a, b, c] = [await createSnap(user), await createSnap(user), await createSnap(user)];

    const res = await createMovie(user, {
      stylePreset: '감성',
      clips: [{ videoId: a }, { videoId: b }, { videoId: c }],
    });

    expect(transitions(res)).toEqual([...(await expectedAi(res.json().data.id, '감성', [a, b, c])), null]);
  });

  it('촬영 시각이 30분 넘게 떨어진 경계는 장면 전환이라 일상도 검게 넘긴다', async () => {
    const user = await h.createUser();
    const morning = await createSnap(user, new Date('2026-05-01T09:00:00Z'));
    const evening = await createSnap(user, new Date('2026-05-01T18:00:00Z'));

    const res = await createMovie(user, { clips: [{ videoId: morning }, { videoId: evening }] });

    expect(transitions(res)).toEqual([{ kind: 'dip', durationMs: 400, owner: 'ai' }, null]);
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

    const movieId = created.json().data.id;
    const res = await patchMovie(user, movieId, { stylePreset: '감성' });

    expect(res.statusCode).toBe(200);
    const ai = await expectedAi(movieId, '감성', [a, b, c]);
    expect(transitions(res)).toEqual([{ kind: 'flash', durationMs: 200, owner: 'user' }, ai[1], null]);
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
      // 떨어진 경계는 AI 가 고른다 — 두 스냅이 한 달 떨어져 장면 전환(일상은 dip 400)이다.
      { kind: 'dip', durationMs: 400, owner: 'ai' },
      null,
    ]);
  });
});

describe('생성(export)은 경계 전환을 editSpec v3 로 보낸다', () => {
  async function withQueues<T>(run: (queues: { legacy: Queue; v3: Queue }) => Promise<T>): Promise<T> {
    const legacy = new Queue(process.env.EDIT_QUEUE_NAME ?? '', { connection: createRedisConnection() });
    const v3 = new Queue(process.env.EDIT_V3_QUEUE_NAME ?? '', { connection: createRedisConnection() });
    try {
      return await run({ legacy, v3 });
    } finally {
      await Promise.all([legacy.close(), v3.close()]);
    }
  }

  it('컷과 고른 전환이 timeline 에 담겨 edit-v3 큐에 들어간다', async () => {
    const user = await h.createUser();
    await h.prisma.creditLedger.create({ data: { userId: user.id, delta: 100, reason: 'promo' } });
    const [a, b, c] = [await createSnap(user), await createSnap(user), await createSnap(user)];
    const movieId = (
      await createMovie(user, {
        stylePreset: '감성',
        clips: [
          { videoId: a, startMs: 500, endMs: 2500, transition: { kind: 'dip', durationMs: 300 } },
          { videoId: b },
          { videoId: c, startMs: 1000 },
        ],
      })
    ).json().data.id;

    const res = await h.app.inject({ method: 'POST', url: `/movies/${movieId}/export`, headers: user.auth });

    expect(res.statusCode).toBe(202);
    const jobId = res.json().data.jobId as string;
    const { owner: _owner, ...aiSecond } = (await expectedAi(movieId, '감성', [a, b, c]))[1]!;
    const expectedSpec = {
      version: 3,
      stylePreset: '감성',
      timeline: {
        cuts: [
          { cutId: 'c0', videoId: a, sourceInMs: 500, sourceOutMs: 2500 },
          { cutId: 'c1', videoId: b, sourceInMs: 0 },
          { cutId: 'c2', videoId: c, sourceInMs: 1000 },
        ],
        transitions: [
          { fromCutId: 'c0', toCutId: 'c1', kind: 'dip', durationMs: 300 },
          { fromCutId: 'c1', toCutId: 'c2', ...aiSecond },
        ],
      },
    };
    // 저장된 작업 스냅샷과 편집 작업 API 응답이 같은 스펙을 말한다.
    expect((await h.prisma.editJob.findUnique({ where: { id: jobId } }))?.editSpec).toEqual(expectedSpec);
    const job = await h.app.inject({ method: 'GET', url: `/edit-jobs/${jobId}`, headers: user.auth });
    expect(job.json().data.editSpec).toEqual(expectedSpec);

    await withQueues(async ({ legacy, v3 }) => {
      const queued = await v3.getJob(jobId);
      expect(queued?.data.editSpec).toEqual(expectedSpec);
      // 최상위 clips 를 남기지 않는다 — 그것만 읽는 워커가 전환을 버리고 렌더할 여지를 없앤다.
      expect(queued?.data.clips).toBeUndefined();
      expect(await legacy.getJob(jobId)).toBeUndefined();
      await queued?.remove();
    });
  });
});
