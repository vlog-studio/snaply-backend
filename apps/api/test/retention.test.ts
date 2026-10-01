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
 * 설계: docs/decisions/snap-retention-period.md §만료의 동작 구조
 *
 * 삭제 경로는 실제 MinIO 에 DeleteObject 를 보낸다. 없는 **키** 삭제는 no-op 이지만 없는 **버킷**은
 * NoSuchBucket 이라, 이 파일이 버킷을 만드는 다른 테스트보다 먼저 돌면(신선한 MinIO · 실행 순서
 * 캐시 없음 = CI) 모든 purge 가 `failed` 로 떨어진다. 그래서 beforeAll 에서 버킷을 보장한다.
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
import {
  createUploadUrl,
  ensureBucketForDev,
  getObjectSize,
} from '../src/services/storage.service.js';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
  // S3 객체 삭제가 실제 MinIO 를 치므로 버킷이 있어야 한다
  await ensureBucketForDev();
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

/** 렌디션 워커가 쓰는 로컬 신호 한 행(apps/ai-worker/src/signals_db.py). */
async function addSignals(videoId: string): Promise<void> {
  await h.prisma.videoSignals.create({
    data: {
      videoId,
      signalsVersion: 1,
      durationMs: 3000,
      stepMs: 100,
      brightness: 0.5,
      sharpness: 300,
      frameHashes: ['0123456789abcdef'],
      motion: [0.01, 0.02],
      hasAudio: true,
      speech: [[200, 900]],
    },
  });
}

describe('로컬 신호는 파일과 함께 사라진다', () => {
  it('만료로 파일을 지우면 신호도 지운다 — 프레임 해시는 내용에서 나온 값이다', async () => {
    const user = await h.createUser();
    const snapId = await snapUploadedDaysAgo(user, SNAP_RETENTION_DAYS + 1);
    const freshId = await snapUploadedDaysAgo(user, SNAP_RETENTION_DAYS - 1);
    await addSignals(snapId);
    await addSignals(freshId);

    await purgeExpiredSnaps();

    expect(await h.prisma.videoSignals.findUnique({ where: { videoId: snapId } })).toBeNull();
    expect(await h.prisma.videoSignals.findUnique({ where: { videoId: freshId } })).not.toBeNull();
  });

  it('사용자가 지운 스냅의 파일을 회수할 때도 지운다', async () => {
    const user = await h.createUser();
    const deleted = await h.prisma.video.create({
      data: {
        userId: user.id,
        kind: 'source',
        status: 'deleted',
        s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
        deletedAt: new Date(),
        removalReason: 'user',
      },
    });
    await addSignals(deleted.id);

    await purgeOrphanedObjects();

    expect(await h.prisma.videoSignals.findUnique({ where: { videoId: deleted.id } })).toBeNull();
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

/**
 * 영상은 **자기가 소유한** 객체만 지운다 (backlog E-8).
 *
 * 결과물 행은 원본 스냅의 키를 복사해 들고 있다. 그 키를 결과물의 것으로 여기면 생성 취소 뒤
 * 정리 배치가 원본 스냅의 파일을 지운다. 반대로 스냅이 소유한 렌디션은 어느 경로도 지우지 않았다.
 * 실제 MinIO 에 객체를 올리고, 경로를 지난 뒤 남아 있는지를 본다.
 */
describe('영상 삭제는 자기가 소유한 객체만 지운다', () => {
  async function putObject(user: TestUser, name: string): Promise<string> {
    // buildUploadKey 가 `uploads/{userId}/{videoId}{ext}` 를 만든다 — 이름에 경로를 넣어
    // 렌디션(`renditions/…`)·편집본(`edited/…`) 자리에도 둔다.
    const { uploadUrl, s3Key } = await createUploadUrl({
      userId: user.id,
      videoId: name,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    });
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: Buffer.from('bytes'),
    });
    expect(put.ok).toBe(true);
    return s3Key;
  }

  async function snapWithRendition(user: TestUser, uploadedDaysAgo = 1) {
    const id = crypto.randomUUID();
    const s3Key = await putObject(user, id);
    const renditionS3Key = await putObject(user, `renditions/${id}`);
    await h.prisma.video.create({
      data: {
        id,
        userId: user.id,
        kind: 'source',
        status: 'ready',
        s3Key,
        originalS3Keys: [s3Key],
        renditionS3Key,
        renditionStatus: 'ready',
        createdAt: cutoffFor(uploadedDaysAgo),
      },
    });
    return { id, s3Key, renditionS3Key };
  }

  /** 편집 작업이 만든 결과물 — createEditJob 처럼 원본 스냅의 키를 복사해 갖는다. */
  async function resultOf(user: TestUser, source: { s3Key: string }, editedS3Key?: string) {
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        kind: 'result',
        status: 'processing',
        originalS3Keys: [source.s3Key],
        ...(editedS3Key ? { editedS3Key } : {}),
      },
    });
    const job = await h.prisma.editJob.create({
      data: { userId: user.id, videoId: video.id, status: 'queued' },
    });
    return { resultId: video.id, jobId: job.id };
  }

  it('생성을 취소한 뒤의 정리 배치가 원본 스냅의 파일을 지우지 않는다', async () => {
    const user = await h.createUser();
    const snap = await snapWithRendition(user);
    const { jobId } = await resultOf(user, snap);

    const cancel = await h.app.inject({
      method: 'DELETE',
      url: `/edit-jobs/${jobId}`,
      headers: user.auth,
    });
    expect(cancel.statusCode).toBe(200);
    await purgeOrphanedObjects();

    expect(await getObjectSize(snap.s3Key)).not.toBeNull();
    const source = await h.prisma.video.findUnique({ where: { id: snap.id } });
    expect(source?.s3Key).toBe(snap.s3Key);
  });

  it('결과물을 지우면 결과물의 파일만 사라진다', async () => {
    const user = await h.createUser();
    const snap = await snapWithRendition(user);
    const editedS3Key = await putObject(user, `edited/${crypto.randomUUID()}`);
    const { resultId } = await resultOf(user, snap, editedS3Key);

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/videos/${resultId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    await purgeOrphanedObjects();

    expect(await getObjectSize(editedS3Key)).toBeNull();
    expect(await getObjectSize(snap.s3Key)).not.toBeNull();
  });

  it('사용자가 스냅을 지우면 렌디션도 사라진다', async () => {
    const user = await h.createUser();
    const snap = await snapWithRendition(user);

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/videos/${snap.id}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);

    expect(await getObjectSize(snap.renditionS3Key)).toBeNull();
    expect(await getObjectSize(snap.s3Key)).toBeNull();
  });

  it('만료된 스냅의 렌디션도 사라진다', async () => {
    const user = await h.createUser();
    const snap = await snapWithRendition(user, SNAP_RETENTION_DAYS + 1);

    const outcome = await purgeExpiredSnaps();

    expect(outcome.purged).toContain(snap.id);
    expect(await getObjectSize(snap.renditionS3Key)).toBeNull();
  });

  it('렌디션만 남은 삭제 스냅도 정리 배치가 회수한다', async () => {
    const user = await h.createUser();
    const renditionS3Key = await putObject(user, `renditions/${crypto.randomUUID()}`);
    const orphan = await h.prisma.video.create({
      data: {
        userId: user.id,
        kind: 'source',
        status: 'deleted',
        renditionS3Key,
        deletedAt: new Date(),
        removalReason: 'user',
      },
    });

    await purgeOrphanedObjects();

    expect(await getObjectSize(renditionS3Key)).toBeNull();
    const row = await h.prisma.video.findUnique({ where: { id: orphan.id } });
    expect(row?.renditionS3Key).toBeNull();
    expect(row?.purgedAt).not.toBeNull();
  });
});
