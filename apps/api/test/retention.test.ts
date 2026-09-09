/**
 * 보관 기간 만료 정리.
 *
 * 고정하는 것 네 가지:
 *   ① 만료는 **유도**된다 — 행에 만료 시각이 없고, 정책 값이 바뀌면 백필 없이 판정이 따라온다
 *   ② 파일만 지우고 **행은 툼스톤으로 남는다** — 사용자는 무엇을 잃었는지 알 수 있어야 하고,
 *      그 영상을 참조하던 무비의 컷도 깨지면 안 된다(SNAP-12)
 *   ③ 사라진 이유(`사용자 삭제` vs `기간 만료`)를 구분해 저장한다
 *   ④ 무비 결과물이 만료돼도 **무비는 남는다** — 사라지는 것은 파일이고 레시피가 아니다
 *
 * 결정: docs/decisions/snap-retention-period.md · movie-cleanup-after-export.md
 * 설계: docs/plans/lifecycle-alignment.md §6
 *
 * S3 호출은 하지 않는다 — 하네스에 MinIO 가 없고, 없는 키 삭제는 어차피 no-op 다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  MOVIE_RESULT_RETENTION_DAYS,
  SNAP_RETENTION_DAYS,
  cutoffFor,
} from '../src/services/retention-policy.js';
import {
  findExpiredMovieResults,
  findExpiredSnaps,
  findOrphanedObjects,
  purgeExpiredMovieResults,
  purgeExpiredSnaps,
  purgeOrphanedObjects,
} from '../src/services/retention.service.js';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** `daysAgo` 일 전에 올라온 스냅. 만료 판정이 업로드 시각에서 유도된다는 것을 쓰는 셈이다. */
async function snapUploadedDaysAgo(user: TestUser, daysAgo: number): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
      createdAt: cutoffFor(daysAgo),
    },
  });
  return video.id;
}

describe('스냅 만료', () => {
  it(`보관 기간(${SNAP_RETENTION_DAYS}일)이 지난 스냅만 대상이 된다`, async () => {
    const user = await h.createUser();
    const expired = await snapUploadedDaysAgo(user, SNAP_RETENTION_DAYS + 1);
    const fresh = await snapUploadedDaysAgo(user, SNAP_RETENTION_DAYS - 1);

    const ids = (await findExpiredSnaps()).map((candidate) => candidate.id);

    expect(ids).toContain(expired);
    expect(ids).not.toContain(fresh);
  });

  it('파일만 지우고 행은 남긴다 — 사유는 expired 로 기록된다', async () => {
    const user = await h.createUser();
    const snapId = await snapUploadedDaysAgo(user, SNAP_RETENTION_DAYS + 1);

    const outcome = await purgeExpiredSnaps();

    expect(outcome.purged).toContain(snapId);
    const row = await h.prisma.video.findUnique({ where: { id: snapId } });
    // 행이 남아야 사용자가 무엇을 잃었는지 알 수 있다.
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.removalReason).toBe('expired');
    expect(row?.purgedAt).not.toBeNull();
    // 가리킬 대상이 없는 주소는 남기지 않는다.
    expect(row?.originalUrls).toEqual([]);
  });

  it('만료된 스냅을 쓰던 무비는 그대로 열리고 그 컷만 unavailable 이 된다', async () => {
    const user = await h.createUser();
    const snapId = await snapUploadedDaysAgo(user, SNAP_RETENTION_DAYS + 1);
    const movie = await h.app.inject({
      method: 'POST',
      url: '/movies',
      headers: user.auth,
      payload: { clips: [{ videoId: snapId }] },
    });
    const movieId = movie.json().data.id;

    await purgeExpiredSnaps();

    const res = await h.app.inject({
      method: 'GET',
      url: `/movies/${movieId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.clips).toHaveLength(1);
    expect(res.json().data.clips[0].unavailable).toBe(true);
  });

  it('이미 사용자가 지운 스냅은 다시 만료 처리하지 않는다', async () => {
    const user = await h.createUser();
    const snapId = await snapUploadedDaysAgo(user, SNAP_RETENTION_DAYS + 1);
    await h.prisma.video.update({
      where: { id: snapId },
      data: { deletedAt: new Date(), removalReason: 'user' },
    });

    const ids = (await findExpiredSnaps()).map((candidate) => candidate.id);

    expect(ids).not.toContain(snapId);
  });
});

describe('무비 결과물 만료', () => {
  async function movieWithResult(
    user: TestUser,
    options: { resultAgeDays: number; finished?: boolean },
  ): Promise<{ movieId: string; resultId: string }> {
    const snapId = await snapUploadedDaysAgo(user, 1);
    const movieId = (
      await h.app.inject({
        method: 'POST',
        url: '/movies',
        headers: user.auth,
        payload: { clips: [{ videoId: snapId }] },
      })
    ).json().data.id;
    const result = await h.prisma.video.create({
      data: {
        userId: user.id,
        kind: 'result',
        status: 'done',
        createdAt: cutoffFor(options.resultAgeDays),
      },
    });
    await h.prisma.movie.update({
      where: { id: movieId },
      data: {
        status: 'ready',
        resultVideoId: result.id,
        ...(options.finished ? { finishedAt: new Date() } : {}),
      },
    });
    return { movieId, resultId: result.id };
  }

  it(`끝내지 않은 채 ${MOVIE_RESULT_RETENTION_DAYS}일이 지나면 대상이 된다`, async () => {
    const user = await h.createUser();
    const old = await movieWithResult(user, { resultAgeDays: MOVIE_RESULT_RETENTION_DAYS + 1 });
    const recent = await movieWithResult(user, { resultAgeDays: 1 });

    const ids = (await findExpiredMovieResults()).map((candidate) => candidate.id);

    expect(ids).toContain(old.movieId);
    expect(ids).not.toContain(recent.movieId);
  });

  it('결과물만 사라지고 무비는 초안으로 남는다 — 고쳐서 다시 만들 수 있다', async () => {
    const user = await h.createUser();
    const { movieId, resultId } = await movieWithResult(user, {
      resultAgeDays: MOVIE_RESULT_RETENTION_DAYS + 1,
    });

    const outcome = await purgeExpiredMovieResults();

    expect(outcome.purged).toContain(movieId);
    const res = await h.app.inject({
      method: 'GET',
      url: `/movies/${movieId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('draft');
    expect(res.json().data.resultVideoId).toBeNull();
    // 컷 구성은 그대로다 — 다시 만들 재료가 남아 있어야 한다.
    expect(res.json().data.clips).toHaveLength(1);
    expect((await h.prisma.video.findUnique({ where: { id: resultId } }))?.removalReason).toBe(
      'expired',
    );
  });

  it('이미 끝낸 무비는 대상이 아니다 — 파일은 그때 이미 사라졌다', async () => {
    const user = await h.createUser();
    const { movieId } = await movieWithResult(user, {
      resultAgeDays: MOVIE_RESULT_RETENTION_DAYS + 1,
      finished: true,
    });

    const ids = (await findExpiredMovieResults()).map((candidate) => candidate.id);

    expect(ids).not.toContain(movieId);
  });
});

describe('남은 S3 객체 회수', () => {
  it('행은 지워졌다는데 키가 남아 있는 영상을 찾아 정리한다', async () => {
    const user = await h.createUser();
    const orphan = await h.prisma.video.create({
      data: {
        userId: user.id,
        kind: 'source',
        status: 'deleted',
        s3Key: `uploads/${user.id}/orphan.mp4`,
        deletedAt: new Date(),
        removalReason: 'user',
      },
    });

    expect((await findOrphanedObjects()).map((candidate) => candidate.id)).toContain(orphan.id);

    await purgeOrphanedObjects();

    const row = await h.prisma.video.findUnique({ where: { id: orphan.id } });
    expect(row?.s3Key).toBeNull();
    expect(row?.purgedAt).not.toBeNull();
    // 원래 사유는 유지된다 — 회수 배치가 "왜 사라졌는지"를 바꾸면 안 된다.
    expect(row?.removalReason).toBe('user');
  });

  it('한 번 정리한 영상은 다시 걸리지 않는다', async () => {
    const user = await h.createUser();
    const orphan = await h.prisma.video.create({
      data: {
        userId: user.id,
        kind: 'source',
        status: 'deleted',
        s3Key: `uploads/${user.id}/orphan2.mp4`,
        deletedAt: new Date(),
        removalReason: 'user',
      },
    });

    await purgeOrphanedObjects();

    expect((await findOrphanedObjects()).map((candidate) => candidate.id)).not.toContain(orphan.id);
  });
});
