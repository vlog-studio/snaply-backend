/**
 * 무비(프로젝트) API.
 *
 * 무비가 서버에 생기면서 고정해야 하는 계약은 네 가지다.
 *   ① 무비는 스냅을 **참조**할 뿐이다 — 무비를 지워도 스냅은 남고, 한 스냅을 여러 무비가 쓴다
 *   ② 컷 순서의 주인이 `arranger` 다 — `ai` 만 촬영 시각으로 정렬되고 `user` 는 보낸 순서를 지킨다
 *   ③ 참조하던 스냅이 사라져도 **무비는 열린다** — 컷을 빼지 않고 `unavailable` 로 표시한다
 *   ④ 끝내면 **결과물만** 사라지고 무비는 남는다
 *
 * 결정: docs/decisions/movie-model.md · movie-export-policy.md · movie-cleanup-after-export.md
 *
 * 생성(export)은 크레딧·큐가 걸려 있어 여기서 다루지 않는다 — 거부 경로만 확인한다.
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

async function createSnap(
  user: TestUser,
  options: { capturedAt?: Date; status?: string } = {},
): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: options.status ?? 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
      ...(options.capturedAt ? { capturedAt: options.capturedAt } : {}),
    },
  });
  return video.id;
}

function createMovie(user: TestUser, body: Record<string, unknown> = {}) {
  return h.app.inject({ method: 'POST', url: '/movies', headers: user.auth, payload: body });
}

function getMovie(user: TestUser, id: string) {
  return h.app.inject({ method: 'GET', url: `/movies/${id}`, headers: user.auth });
}

describe('POST /movies', () => {
  it('인증 없이는 401 이다', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/movies', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('컷 없이 빈 초안을 만든다', async () => {
    const user = await h.createUser();
    const res = await createMovie(user);

    expect(res.statusCode).toBe(201);
    const movie = res.json().data;
    expect(movie.status).toBe('draft');
    expect(movie.clips).toEqual([]);
    expect(movie.resultVideoId).toBeNull();
    expect(movie.finishedAt).toBeNull();
    // 쇼츠가 기본이라 자막은 꺼진 채로 시작한다.
    expect(movie.captions).toBe(false);
  });

  it('보낸 배열 순서가 곧 재생 순서다 (arranger 기본값 user)', async () => {
    const user = await h.createUser();
    // 촬영 시각을 일부러 역순으로 둔다 — user 면 서버가 다시 정렬하지 않아야 한다.
    const older = await createSnap(user, { capturedAt: new Date('2026-01-01T00:00:00Z') });
    const newer = await createSnap(user, { capturedAt: new Date('2026-06-01T00:00:00Z') });

    const res = await createMovie(user, { clips: [{ videoId: newer }, { videoId: older }] });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.arranger).toBe('user');
    expect(res.json().data.clips.map((clip: { videoId: string }) => clip.videoId)).toEqual([
      newer,
      older,
    ]);
  });

  it('arranger 가 ai 면 촬영 시각 순으로 정렬한다', async () => {
    const user = await h.createUser();
    const older = await createSnap(user, { capturedAt: new Date('2026-01-01T00:00:00Z') });
    const newer = await createSnap(user, { capturedAt: new Date('2026-06-01T00:00:00Z') });

    const res = await createMovie(user, {
      arranger: 'ai',
      clips: [{ videoId: newer }, { videoId: older }],
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.clips.map((clip: { videoId: string }) => clip.videoId)).toEqual([
      older,
      newer,
    ]);
  });

  it('같은 스냅을 다른 구간으로 여러 번 쓸 수 있다', async () => {
    const user = await h.createUser();
    const snapId = await createSnap(user);

    const res = await createMovie(user, {
      clips: [
        { videoId: snapId, startMs: 0, endMs: 1000 },
        { videoId: snapId, startMs: 2000, endMs: 3000 },
      ],
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.clips).toHaveLength(2);
  });

  it('남의 스냅은 담을 수 없다', async () => {
    const [owner, stranger] = [await h.createUser(), await h.createUser()];
    const snapId = await createSnap(owner);

    const res = await createMovie(stranger, { clips: [{ videoId: snapId }] });

    expect(res.statusCode).toBe(403);
  });

  it('컷은 10개를 넘을 수 없다', async () => {
    const user = await h.createUser();
    const snapId = await createSnap(user);

    const res = await createMovie(user, {
      clips: Array.from({ length: 11 }, () => ({ videoId: snapId })),
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /movies', () => {
  it('최근 편집한 순서로 준다', async () => {
    const user = await h.createUser();
    const first = (await createMovie(user, { title: '먼저' })).json().data.id;
    const second = (await createMovie(user, { title: '나중' })).json().data.id;

    const res = await h.app.inject({ method: 'GET', url: '/movies', headers: user.auth });

    expect(res.statusCode).toBe(200);
    const ids = res.json().data.items.map((movie: { id: string }) => movie.id);
    expect(ids.slice(0, 2)).toEqual([second, first]);
  });

  it('남의 무비는 목록에 없다', async () => {
    const [owner, stranger] = [await h.createUser(), await h.createUser()];
    await createMovie(owner, { title: '남의 것' });

    const res = await h.app.inject({ method: 'GET', url: '/movies', headers: stranger.auth });

    expect(res.json().data.items).toEqual([]);
  });
});

describe('GET /movies/:id', () => {
  it('남의 무비는 403 이 아니라 404 다', async () => {
    const [owner, stranger] = [await h.createUser(), await h.createUser()];
    const movieId = (await createMovie(owner)).json().data.id;

    expect((await getMovie(stranger, movieId)).statusCode).toBe(404);
  });

  it('스냅이 삭제돼도 무비는 열리고, 그 컷만 unavailable 로 표시된다', async () => {
    const user = await h.createUser();
    const kept = await createSnap(user);
    const lost = await createSnap(user);
    const movieId = (await createMovie(user, { clips: [{ videoId: kept }, { videoId: lost }] }))
      .json().data.id;

    // 스냅을 지워도 행은 툼스톤으로 남는다 (SNAP-12).
    await h.prisma.video.update({ where: { id: lost }, data: { deletedAt: new Date() } });

    const res = await getMovie(user, movieId);

    expect(res.statusCode).toBe(200);
    const clips = res.json().data.clips;
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ videoId: kept, unavailable: false });
    expect(clips[1]).toMatchObject({ videoId: lost, unavailable: true });
  });
});

describe('PATCH /movies/:id', () => {
  it('clips 를 보내면 컷 목록을 통째로 교체한다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const movieId = (await createMovie(user, { clips: [{ videoId: a }] })).json().data.id;

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/movies/${movieId}`,
      headers: user.auth,
      payload: { clips: [{ videoId: b }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.clips.map((clip: { videoId: string }) => clip.videoId)).toEqual([b]);
  });

  it('생성 중인 무비는 409 로 거부한다', async () => {
    const user = await h.createUser();
    const movieId = (await createMovie(user)).json().data.id;
    await h.prisma.movie.update({ where: { id: movieId }, data: { status: 'generating' } });

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/movies/${movieId}`,
      headers: user.auth,
      payload: { title: '바꿔보기' },
    });

    expect(res.statusCode).toBe(409);
  });
});

describe('DELETE /movies/:id', () => {
  it('무비를 지워도 스냅은 남는다', async () => {
    const user = await h.createUser();
    const snapId = await createSnap(user);
    const movieId = (await createMovie(user, { clips: [{ videoId: snapId }] })).json().data.id;

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/movies/${movieId}`,
      headers: user.auth,
    });

    expect(res.statusCode).toBe(200);
    expect((await getMovie(user, movieId)).statusCode).toBe(404);
    // 재료는 그대로다 — 다른 무비가 같은 스냅을 쓰고 있을 수 있다.
    const snap = await h.prisma.video.findUnique({ where: { id: snapId } });
    expect(snap?.deletedAt).toBeNull();
  });
});

describe('POST /movies/:id/export', () => {
  it('컷이 없으면 400 이다', async () => {
    const user = await h.createUser();
    const movieId = (await createMovie(user)).json().data.id;

    const res = await h.app.inject({
      method: 'POST',
      url: `/movies/${movieId}/export`,
      headers: user.auth,
    });

    expect(res.statusCode).toBe(400);
  });

  it('사라진 스냅이 섞여 있으면 400 이다 — 빼고 다시 시도하라는 뜻', async () => {
    const user = await h.createUser();
    const lost = await createSnap(user);
    const movieId = (await createMovie(user, { clips: [{ videoId: lost }] })).json().data.id;
    await h.prisma.video.update({ where: { id: lost }, data: { deletedAt: new Date() } });

    const res = await h.app.inject({
      method: 'POST',
      url: `/movies/${movieId}/export`,
      headers: user.auth,
    });

    expect(res.statusCode).toBe(400);
  });

  it('이미 생성 중이면 409 다', async () => {
    const user = await h.createUser();
    const snapId = await createSnap(user);
    const movieId = (await createMovie(user, { clips: [{ videoId: snapId }] })).json().data.id;
    await h.prisma.movie.update({ where: { id: movieId }, data: { status: 'generating' } });

    const res = await h.app.inject({
      method: 'POST',
      url: `/movies/${movieId}/export`,
      headers: user.auth,
    });

    expect(res.statusCode).toBe(409);
  });
});

describe('POST /movies/:id/finish', () => {
  it('결과물만 지우고 무비는 남긴다 — 끝낸 뒤에도 편집할 수 있다', async () => {
    const user = await h.createUser();
    const snapId = await createSnap(user);
    const movieId = (await createMovie(user, { clips: [{ videoId: snapId }] })).json().data.id;

    // 생성이 끝난 상태를 만든다 (워커·크레딧을 거치지 않고 결과만 흉내낸다).
    const result = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'done' },
    });
    await h.prisma.movie.update({
      where: { id: movieId },
      data: { status: 'ready', resultVideoId: result.id },
    });

    const res = await h.app.inject({
      method: 'POST',
      url: `/movies/${movieId}/finish`,
      headers: user.auth,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.resultDeleted).toBe(true);

    const after = await getMovie(user, movieId);
    expect(after.statusCode).toBe(200);
    expect(after.json().data.finishedAt).not.toBeNull();
    // 결과물은 사라졌지만 컷 구성은 그대로 남아 다시 만들 수 있다.
    expect(after.json().data.resultVideoId).toBeNull();
    expect(after.json().data.clips).toHaveLength(1);

    // 끝낸 뒤에도 수정이 된다 — 사라지는 것은 파일이지 무비가 아니다.
    const edit = await h.app.inject({
      method: 'PATCH',
      url: `/movies/${movieId}`,
      headers: user.auth,
      payload: { title: '고쳐서 다시' },
    });
    expect(edit.statusCode).toBe(200);
  });

  it('생성 중이면 409 다', async () => {
    const user = await h.createUser();
    const movieId = (await createMovie(user)).json().data.id;
    await h.prisma.movie.update({ where: { id: movieId }, data: { status: 'generating' } });

    const res = await h.app.inject({
      method: 'POST',
      url: `/movies/${movieId}/finish`,
      headers: user.auth,
    });

    expect(res.statusCode).toBe(409);
  });
});
