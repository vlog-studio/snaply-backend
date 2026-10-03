/**
 * 편집 초안 제안 API(specs/movie.md MOV-21, POST /movie-drafts).
 *
 * 고정하는 계약:
 *   ① 제안은 무비가 아니다 — 컷(촬영순)과 넣지 않은 스냅을 돌려주고, 앱이 그것으로 무비를 만든다
 *   ② 업로드되지 않은 스냅과 신호가 없는 스냅은 빼지 않고 구간 없이 놓는다. 신호가 없으면 신호 계산을 적재한다
 *   ③ 상한은 서버가 집행한다 — 한 번에 30개(400 `TOO_MANY_SNAPS` + max) · 24시간 10번(429 `DRAFT_LIMIT`)
 *   ④ 같은 요청은 24시간 안에서 같은 제안이고 횟수에 세지 않는다(신호를 기다리는 스냅이 없었던 제안만 — 이 신호 버전으로
 *      읽을 수 없다고 끝난 스냅은 기다릴 것이 없다). 끝난 신호 작업은 지우고 다시 적재한다
 *   ⑤ 남의 스냅은 403. 자기 스냅이지만 지워졌거나 준비되지 않은 스냅은 거절하지 않고 `unavailable` 로 알린다
 *   ⑥ 분석 동의를 철회하면 초안 기록도 지운다
 * 고르는 규칙 자체는 edit-director.test.ts 가 고정한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { createRedisConnection } from '../src/lib/redis.js';
import { DAILY_DRAFT_LIMIT } from '../src/services/movie-draft.service.js';
import { DRAFT_THRESHOLDS, SIGNALS_VERSION } from '../src/services/edit-director.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const T0 = Date.parse('2026-10-01T09:00:00Z');

let hashSeed = 0;
/** 스냅마다 다른 장면의 해시 — 서로 중복이 되지 않게 비트를 크게 다르게 한다. */
function freshHash(): string {
  hashSeed += 1;
  const value = BigInt.asUintN(64, BigInt(hashSeed) * 0x9e3779b97f4a7c15n);
  return value.toString(16).padStart(16, '0');
}

async function createSnap(
  user: TestUser,
  minute: number,
  signals: { brightness?: number; version?: number } | null = {},
): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
      capturedAt: new Date(T0 + minute * 60_000),
    },
  });
  if (signals !== null) {
    const hash = freshHash();
    await h.prisma.videoSignals.create({
      data: {
        videoId: video.id,
        signalsVersion: signals.version ?? SIGNALS_VERSION,
        durationMs: 3000,
        stepMs: 100,
        brightness: signals.brightness ?? 0.5,
        sharpness: 300,
        frameHashes: [hash, hash, hash],
        motion: Array.from({ length: 29 }, () => 0.01),
        hasAudio: false,
        speech: [],
      },
    });
  }
  return video.id;
}

function requestDraft(user: TestUser, body: Record<string, unknown>) {
  return h.app.inject({ method: 'POST', url: '/movie-drafts', headers: user.auth, payload: body });
}

async function signalJobs(videoIds: string[]): Promise<string[]> {
  const queue = new Queue(process.env.RENDITION_QUEUE_NAME ?? '', { connection: createRedisConnection() });
  try {
    const jobs = await Promise.all(videoIds.map((id) => queue.getJob(`signals-${id}`)));
    return jobs.filter((job) => job !== undefined && job.data.only === 'signals').map((job) => job!.data.videoId as string);
  } finally {
    await queue.close();
  }
}

/**
 * 신호 작업 하나를 워커가 끝낸 것처럼 만든다 — 결과를 돌려주며 끝났거나(`completed`) 재시도를 소진했다(`failed`).
 * 테스트 큐에는 워커가 없어 앞선 테스트의 작업이 기다리고 있으므로, 맨 앞(lifo)에 넣고 바로 꺼낸다.
 */
async function finishSignalsJob(videoId: string, outcome: { returned: object } | { failed: string }): Promise<void> {
  const name = process.env.RENDITION_QUEUE_NAME ?? '';
  const queue = new Queue(name, { connection: createRedisConnection() });
  const worker = new Worker(name, null, { connection: createRedisConnection(), autorun: false });
  try {
    await queue.add(
      'signals',
      { videoId, userId: 'u', s3Key: 'k', only: 'signals' },
      { jobId: `signals-${videoId}`, lifo: true, attempts: 1 },
    );
    const token = crypto.randomUUID();
    const job = await worker.getNextJob(token);
    expect(job?.id).toBe(`signals-${videoId}`);
    if ('failed' in outcome) await job!.moveToFailed(new Error(outcome.failed), token, false);
    else await job!.moveToCompleted(outcome.returned, token, false);
  } finally {
    await worker.close();
    await queue.close();
  }
}

async function signalJobState(videoId: string): Promise<string | undefined> {
  const queue = new Queue(process.env.RENDITION_QUEUE_NAME ?? '', { connection: createRedisConnection() });
  try {
    return (await queue.getJob(`signals-${videoId}`))?.getState();
  } finally {
    await queue.close();
  }
}

describe('제안', () => {
  it('촬영순으로 놓고 컷마다 구간을 자르며, 업로드되지 않은 스냅은 그 자리에 구간 없이 둔다', async () => {
    const user = await h.createUser();
    const late = await createSnap(user, 20);
    const early = await createSnap(user, 0);
    const res = await requestDraft(user, {
      stylePreset: '감성',
      snaps: [{ videoId: late }, { localId: 'local-1', capturedAt: new Date(T0 + 10 * 60_000).toISOString() }, { videoId: early }],
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.stylePreset).toBe('감성');
    expect(data.cuts.map((cut: { videoId?: string; localId?: string }) => cut.videoId ?? cut.localId)).toEqual([
      early,
      'local-1',
      late,
    ]);
    // 3초 감성의 마지막 컷(closer): 길이를 줄여 앞뒤 여분 400 을 지킨다. 첫 컷(hook)은 더 짧다.
    expect(data.cuts[2]).toMatchObject({ startMs: 400, endMs: 2600 });
    expect(data.cuts[0].endMs - data.cuts[0].startMs).toBe(2100);
    expect(data.cuts[1]).toEqual({ localId: 'local-1' });
    expect(data.excluded).toEqual([]);
  });

  it('못 쓰는 스냅은 excluded 로 돌려준다 — 이유 없이', async () => {
    const user = await h.createUser();
    const ok1 = await createSnap(user, 0);
    const dark = await createSnap(user, 1, { brightness: DRAFT_THRESHOLDS.darkBrightness / 2 });
    const ok2 = await createSnap(user, 2);
    const res = await requestDraft(user, { snaps: [{ videoId: ok1 }, { videoId: dark }, { videoId: ok2 }] });

    expect(res.json().data.excluded).toEqual([{ videoId: dark }]);
    expect(res.json().data.cuts).toHaveLength(2);
  });

  it('제안의 컷은 그대로 무비가 된다 — arranger ai · trimOwner ai', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user, 0), await createSnap(user, 1)];
    const draft = (await requestDraft(user, { snaps: [{ videoId: a }, { videoId: b }] })).json().data;

    const movie = await h.app.inject({
      method: 'POST',
      url: '/movies',
      headers: user.auth,
      payload: {
        arranger: 'ai',
        stylePreset: draft.stylePreset,
        clips: draft.cuts.map((cut: Record<string, unknown>) => ({ ...cut, trimOwner: 'ai' })),
      },
    });
    expect(movie.statusCode).toBe(201);
    expect(movie.json().data.clips.map((clip: { trimOwner: string }) => clip.trimOwner)).toEqual(['ai', 'ai']);
  });
});

describe('신호가 없는 스냅', () => {
  it('검사 없이 구간 없이 들어가고, 신호 계산이 적재된다 — 이전 버전의 신호도 없는 것과 같다', async () => {
    const user = await h.createUser();
    const fresh = await createSnap(user, 0);
    const none = await createSnap(user, 1, null);
    const stale = await createSnap(user, 2, { version: SIGNALS_VERSION + 1 });
    const res = await requestDraft(user, { snaps: [{ videoId: fresh }, { videoId: none }, { videoId: stale }] });

    expect(res.json().data.cuts.slice(1)).toEqual([{ videoId: none }, { videoId: stale }]);
    expect((await signalJobs([fresh, none, stale])).sort()).toEqual([none, stale].sort());
  });

  it('그 제안은 재사용하지 않는다 — 신호가 생긴 뒤 다시 받으면 검사한 초안이 나온다', async () => {
    const user = await h.createUser();
    const a = await createSnap(user, 0);
    const none = await createSnap(user, 1, null);
    const body = { snaps: [{ videoId: a }, { videoId: none }] };
    await requestDraft(user, body);
    await requestDraft(user, body);

    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(2);
  });

  it.each([
    ['재시도를 소진한 작업', { failed: 'storage down' }],
    ['신호를 남기지 못하고 끝난 작업', { returned: { status: 'skipped' } }],
    ['다른 신호 버전으로 읽지 못한 작업', { returned: { status: 'failed', signalsVersion: SIGNALS_VERSION + 1 } }],
    ['버전 없이 읽지 못한 작업(이 규칙 전의 워커)', { returned: { status: 'failed' } }],
  ] as const)('끝난 신호 작업은 지우고 다시 적재한다 — %s', async (_name, outcome) => {
    // 큐가 끝난 작업을 남겨 두어 같은 job id 의 적재를 무시했다 — 한 번 끝난 스냅은 다시 계산되지 않았다(backlog E-13).
    const user = await h.createUser();
    const none = await createSnap(user, 0, null);
    await finishSignalsJob(none, outcome);

    await requestDraft(user, { snaps: [{ videoId: none }] });

    expect(await signalJobState(none)).toBe('waiting');
  });

  it('이 신호 버전으로 읽을 수 없다고 끝난 스냅은 다시 돌리지 않고, 그 제안은 재사용한다 — 한도를 쓰지 않는다', async () => {
    const user = await h.createUser();
    const a = await createSnap(user, 0);
    const unreadable = await createSnap(user, 1, null);
    await finishSignalsJob(unreadable, { returned: { status: 'failed', signalsVersion: SIGNALS_VERSION } });
    const body = { snaps: [{ videoId: a }, { videoId: unreadable }] };

    const first = await requestDraft(user, body);
    const second = await requestDraft(user, body);

    expect(await signalJobState(unreadable)).toBe('completed');
    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(1);
    expect(second.json().data).toEqual(first.json().data);
    // 검사 없이 들어간다 — 구간 없이 스냅 전체.
    expect(first.json().data.cuts).toContainEqual({ videoId: unreadable });
  });
});

describe('상한 — 동시에 온 요청', () => {
  it(`남은 한 번을 동시에 다투면 하나만 받는다 — ${DAILY_DRAFT_LIMIT}번을 넘겨 쓰지 않는다`, async () => {
    const user = await h.createUser();
    await h.prisma.movieDraft.createMany({
      data: Array.from({ length: DAILY_DRAFT_LIMIT - 1 }, (_, i) => ({
        userId: user.id,
        stylePreset: '일상',
        snapHash: `seed-${i}`,
        complete: true,
        result: { stylePreset: '일상', cuts: [], excluded: [] },
      })),
    });
    const snaps = await Promise.all(Array.from({ length: 5 }, (_, i) => createSnap(user, i)));

    // 서로 다른 요청 다섯 — 모두 앞의 빠른 확인(9 < 10)을 지나 계산까지 간다.
    const answers = await Promise.all(snaps.map((videoId) => requestDraft(user, { snaps: [{ videoId }] })));

    expect(answers.map((res) => res.statusCode).sort()).toEqual([200, 429, 429, 429, 429]);
    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(DAILY_DRAFT_LIMIT);
  });
});

describe('상한', () => {
  it('31개는 400 TOO_MANY_SNAPS 이고 max 를 알려준다', async () => {
    const user = await h.createUser();
    const snaps = Array.from({ length: 31 }, (_, i) => ({
      localId: `l-${i}`,
      capturedAt: new Date(T0 + i * 60_000).toISOString(),
    }));
    const res = await requestDraft(user, { snaps });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'TOO_MANY_SNAPS', max: 30 });
  });

  it(`같은 요청은 같은 제안이고 세지 않는다 — 다른 요청은 ${DAILY_DRAFT_LIMIT}번까지`, async () => {
    const user = await h.createUser();
    const a = await createSnap(user, 0);
    const same = { snaps: [{ videoId: a }] };
    const first = await requestDraft(user, same);
    const again = await requestDraft(user, same);
    expect(again.json().data).toEqual(first.json().data);
    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(1);

    // 나머지 기록은 직접 넣는다 — API 로 채우면 분당 버스트 제한(10회)이 먼저 걸린다.
    await h.prisma.movieDraft.createMany({
      data: Array.from({ length: DAILY_DRAFT_LIMIT - 1 }, (_, i) => ({
        userId: user.id,
        stylePreset: '일상',
        snapHash: `other-${i}`,
        complete: true,
        result: { stylePreset: '일상', cuts: [], excluded: [] },
      })),
    });
    const over = await requestDraft(user, { snaps: [{ videoId: a }, { localId: 'one-more', capturedAt: new Date(T0).toISOString() }] });
    expect(over.statusCode).toBe(429);
    expect(over.json().error.code).toBe('DRAFT_LIMIT');

    // 한도에 닿아도 이미 받은 제안은 다시 받을 수 있다.
    expect((await requestDraft(user, same)).statusCode).toBe(200);
  });
});

describe('규칙이 바뀌면', () => {
  it('예전 규칙의 제안을 재사용하지 않는다 — 재사용 키에 규칙 버전이 들어간다', async () => {
    const user = await h.createUser();
    const a = await createSnap(user, 0);
    // 규칙 버전이 키에 들어가기 전의 키로 저장된 제안. 그대로 재사용되면 컷이 하나도 없는 제안이 돌아온다.
    await h.prisma.movieDraft.create({
      data: {
        userId: user.id,
        stylePreset: '일상',
        snapHash: createHash('sha256').update(`일상\nv:${a}`).digest('hex'),
        complete: true,
        result: { stylePreset: '일상', cuts: [], excluded: [] },
      },
    });

    const res = await requestDraft(user, { snaps: [{ videoId: a }] });
    expect(res.json().data.cuts).toHaveLength(1);
  });
});

describe('쓸 수 없는 자기 스냅', () => {
  it('지워졌거나 준비되지 않은 스냅은 빼고 unavailable 로 알린다 — 나머지로 초안을 만든다', async () => {
    const user = await h.createUser();
    const ok = await createSnap(user, 0);
    const deleted = await createSnap(user, 1);
    const pending = await createSnap(user, 2);
    await h.prisma.video.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
    await h.prisma.video.update({ where: { id: pending }, data: { status: 'pending' } });

    const res = await requestDraft(user, {
      snaps: [{ videoId: ok }, { videoId: deleted }, { videoId: pending }],
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.cuts.map((cut: { videoId: string }) => cut.videoId)).toEqual([ok]);
    // excluded 에 넣으면 앱이 다시 넣으라고 권한다 — 서버에 없는 스냅으로는 무비를 만들 수 없다.
    expect(data.excluded).toEqual([]);
    expect(data.unavailable).toEqual([{ videoId: deleted }, { videoId: pending }]);
  });

  it('모두 쓸 수 없으면 컷 없이 돌려주고 기록하지 않는다 — 횟수에 세지 않는다', async () => {
    const user = await h.createUser();
    const deleted = await createSnap(user, 0);
    await h.prisma.video.update({ where: { id: deleted }, data: { deletedAt: new Date() } });

    const res = await requestDraft(user, { snaps: [{ videoId: deleted }] });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ cuts: [], excluded: [], unavailable: [{ videoId: deleted }] });
    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(0);
  });

  it('스냅이 사라진 뒤에는 그 스냅을 담은 예전 제안을 재사용하지 않는다', async () => {
    const user = await h.createUser();
    const a = await createSnap(user, 0);
    const b = await createSnap(user, 1);
    const first = await requestDraft(user, { snaps: [{ videoId: a }, { videoId: b }] });
    expect(first.json().data.cuts).toHaveLength(2);

    await h.prisma.video.update({ where: { id: b }, data: { deletedAt: new Date() } });
    const again = await requestDraft(user, { snaps: [{ videoId: a }, { videoId: b }] });

    expect(again.json().data.cuts.map((cut: { videoId: string }) => cut.videoId)).toEqual([a]);
    expect(again.json().data.unavailable).toEqual([{ videoId: b }]);
  });

  it('재사용한 제안에도 unavailable 이 붙는다', async () => {
    const user = await h.createUser();
    const a = await createSnap(user, 0);
    const b = await createSnap(user, 1);
    await h.prisma.video.update({ where: { id: b }, data: { deletedAt: new Date() } });
    const body = { snaps: [{ videoId: a }, { videoId: b }] };

    await requestDraft(user, body);
    const reused = await requestDraft(user, body);

    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(1);
    expect(reused.json().data.unavailable).toEqual([{ videoId: b }]);
  });
});

describe('권한과 파기', () => {
  it('남의 스냅이 섞이면 403', async () => {
    const [user, other] = [await h.createUser(), await h.createUser()];
    const mine = await createSnap(user, 0);
    const theirs = await createSnap(other, 1);
    const res = await requestDraft(user, { snaps: [{ videoId: mine }, { videoId: theirs }] });
    expect(res.statusCode).toBe(403);
  });

  it('남의 지운 스냅도 unavailable 이 아니라 403 — 남의 id 로 존재를 떠보지 못하게', async () => {
    const [user, other] = [await h.createUser(), await h.createUser()];
    const mine = await createSnap(user, 0);
    const theirs = await createSnap(other, 1);
    await h.prisma.video.update({ where: { id: theirs }, data: { deletedAt: new Date() } });

    const res = await requestDraft(user, { snaps: [{ videoId: mine }, { videoId: theirs }] });
    expect(res.statusCode).toBe(403);
  });

  it('분석 동의를 철회하면 초안 기록도 지운다', async () => {
    const user = await h.createUser();
    const a = await createSnap(user, 0);
    await requestDraft(user, { snaps: [{ videoId: a }] });

    const res = await h.app.inject({ method: 'DELETE', url: '/auth/me/analysis-consent', headers: user.auth });
    expect(res.statusCode).toBe(200);
    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(0);
  });
});
