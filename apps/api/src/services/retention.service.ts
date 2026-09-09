import { getPrisma } from '../db/client.js';
import { captureException } from '../lib/sentry.js';
import {
  EXPIRY_TO_PURGE_DAYS,
  MOVIE_RESULT_RETENTION_DAYS,
  SNAP_RETENTION_DAYS,
  cutoffFor,
} from './retention-policy.js';
import { deleteObject } from './storage.service.js';

/**
 * 보관 기간이 지난 것을 지우는 경로.
 *
 * 세 가지가 같은 모양을 공유한다 — 스냅 원본(15일), 끝내지 않은 무비 결과물(30일), 그리고
 * 앞선 삭제에서 S3 만 실패해 남은 객체. 셋 다 "대상을 찾고 → 파일을 지우고 → 행에 사실을
 * 남긴다" 이고, 개별 실패는 기록만 하고 다음으로 넘어간다(다음 실행에서 재시도된다).
 *
 * 두 가지 원칙이 이 파일 전체에 걸쳐 있다:
 *
 * ① **만료는 유도한다.** 어떤 행도 "언제 만료된다"를 들고 있지 않다. 업로드·생성 시각과
 *    현재 정책 값으로 매번 계산하므로, 기간이 바뀌거나 요금제가 사용자별로 다른 기간을
 *    팔기 시작해도 백필이 필요 없다(services/retention-policy.ts).
 *
 * ② **삭제는 에셋 단위다.** 원본·썸네일·편집본을 각각 지울 수 있게 두고, 지금 정책인
 *    "전부 지움"을 그 위에 얹는다. 요금제가 "원본은 지우되 썸네일은 유지" 같은 조합을
 *    요구해도 삭제 코드를 다시 뜯지 않기 위해서다(docs/plans/lifecycle-alignment.md §6-1).
 */

export interface ExpiryCandidate {
  id: string;
  /** 만료 기준이 된 시각 — 스냅은 업로드, 무비 결과물은 생성 시각. */
  since: Date;
}

export interface PurgeOutcome {
  purged: string[];
  failed: string[];
}

/** 한 영상이 들고 있는 S3 객체 전부. 에셋별로 나뉘어 있어야 정책이 바뀌어도 골라 지울 수 있다. */
function assetKeysOf(video: {
  s3Key: string | null;
  originalS3Keys: string[];
  editedS3Key: string | null;
  thumbnailS3Key: string | null;
}): string[] {
  return [
    video.s3Key,
    ...video.originalS3Keys,
    video.editedS3Key,
    video.thumbnailS3Key,
  ].filter((key): key is string => typeof key === 'string' && key.length > 0);
}

const VIDEO_ASSET_SELECT = {
  id: true,
  s3Key: true,
  originalS3Keys: true,
  editedS3Key: true,
  thumbnailS3Key: true,
} as const;

/**
 * 영상 하나의 파일을 지우고 툼스톤으로 만든다.
 *
 * **행은 남긴다.** 사용자는 무엇이 사라졌는지 알 수 있어야 하고(SNAP-12), 그 영상을 참조하던
 * 무비의 컷도 깨지지 않아야 한다. 그래서 지우는 것은 바이트뿐이고 메타데이터는 남는다.
 * URL 컬럼은 비운다 — 더 이상 가리킬 대상이 없는 주소를 남기면 앱이 404 를 재생하려 든다.
 */
async function purgeVideoAssets(video: {
  id: string;
  s3Key: string | null;
  originalS3Keys: string[];
  editedS3Key: string | null;
  thumbnailS3Key: string | null;
}): Promise<void> {
  for (const key of assetKeysOf(video)) {
    await deleteObject(key);
  }
  await getPrisma().video.update({
    where: { id: video.id },
    data: {
      deletedAt: new Date(),
      removalReason: 'expired',
      purgedAt: new Date(),
      originalUrls: [],
      editedUrl: null,
      thumbnailUrl: null,
    },
  });
}

/** 보관 기간이 지난 스냅 원본. 이미 사라진 것과 편집 결과물은 대상이 아니다. */
export async function findExpiredSnaps(now: Date = new Date()): Promise<ExpiryCandidate[]> {
  const rows = await getPrisma().video.findMany({
    where: {
      kind: 'source',
      status: 'ready',
      deletedAt: null,
      createdAt: { lte: cutoffFor(SNAP_RETENTION_DAYS + EXPIRY_TO_PURGE_DAYS, now) },
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({ id: row.id, since: row.createdAt }));
}

export async function purgeExpiredSnaps(now: Date = new Date()): Promise<PurgeOutcome> {
  const prisma = getPrisma();
  const purged: string[] = [];
  const failed: string[] = [];

  for (const candidate of await findExpiredSnaps(now)) {
    try {
      const video = await prisma.video.findUnique({
        where: { id: candidate.id },
        select: VIDEO_ASSET_SELECT,
      });
      if (!video) continue;
      await purgeVideoAssets(video);
      purged.push(video.id);
    } catch (err) {
      captureException(err, { videoId: candidate.id, phase: 'snap-expiry-purge' });
      failed.push(candidate.id);
    }
  }
  return { purged, failed };
}

/**
 * 보관 상한이 지난 **끝내지 않은** 무비 결과물.
 *
 * 끝낸 결과물은 이미 사라졌으므로 여기 걸리지 않는다 — 이 배치는 사용자가 다운로드도 게시도
 * 하지 않고 놔둔 파일이 무한히 남지 않게 하는 안전망이다(MOV-16).
 */
export async function findExpiredMovieResults(now: Date = new Date()): Promise<ExpiryCandidate[]> {
  const rows = await getPrisma().movie.findMany({
    where: {
      deletedAt: null,
      finishedAt: null,
      resultVideoId: { not: null },
      resultVideo: {
        deletedAt: null,
        createdAt: { lte: cutoffFor(MOVIE_RESULT_RETENTION_DAYS + EXPIRY_TO_PURGE_DAYS, now) },
      },
    },
    select: { id: true, resultVideo: { select: { createdAt: true } } },
  });
  return rows.flatMap((row) =>
    row.resultVideo ? [{ id: row.id, since: row.resultVideo.createdAt }] : [],
  );
}

/**
 * 만료된 무비 결과물을 지운다. **무비 자체는 남는다** — 사라지는 것은 파일이고 레시피는
 * 영구 보관되므로 사용자는 고쳐서 다시 만들 수 있다(그것은 새 생성이라 유료다, MOV-19).
 */
export async function purgeExpiredMovieResults(now: Date = new Date()): Promise<PurgeOutcome> {
  const prisma = getPrisma();
  const purged: string[] = [];
  const failed: string[] = [];

  for (const candidate of await findExpiredMovieResults(now)) {
    try {
      const movie = await prisma.movie.findUnique({
        where: { id: candidate.id },
        select: { id: true, resultVideoId: true },
      });
      if (!movie?.resultVideoId) continue;

      const video = await prisma.video.findUnique({
        where: { id: movie.resultVideoId },
        select: VIDEO_ASSET_SELECT,
      });
      if (video) {
        await purgeVideoAssets(video);
      }
      // 결과물 포인터를 비우면 무비는 다시 초안이다 — 컷 구성은 그대로 남는다.
      await prisma.movie.update({
        where: { id: movie.id },
        data: { resultVideoId: null, status: 'draft' },
      });
      purged.push(movie.id);
    } catch (err) {
      captureException(err, { movieId: candidate.id, phase: 'movie-result-expiry-purge' });
      failed.push(candidate.id);
    }
  }
  return { purged, failed };
}

/**
 * 앞선 삭제에서 **S3 만 실패해 남은 객체**를 회수한다 (backlog E-3).
 *
 * 삭제 경로들은 S3 실패를 이유로 사용자 동작을 되돌리지 않는다 — 끝내기가 그렇고(사용자는
 * 이미 파일을 가져갔다), 계정 삭제도 그렇다. 대신 행에 "지웠다"만 남고 객체가 남을 수 있는데,
 * 그 차이를 여기서 메운다: **행은 지워졌다고 하는데 키가 아직 달려 있는** 영상을 찾아 지운다.
 *
 * 계정 purge 는 유저 prefix 를 통째로 지우므로 이 배치가 필요 없지만, 영상 단건 삭제는
 * 여전히 필요하다.
 */
export async function findOrphanedObjects(): Promise<ExpiryCandidate[]> {
  const rows = await getPrisma().video.findMany({
    where: {
      deletedAt: { not: null },
      purgedAt: null,
      OR: [
        { s3Key: { not: null } },
        { editedS3Key: { not: null } },
        { thumbnailS3Key: { not: null } },
        { NOT: { originalS3Keys: { isEmpty: true } } },
      ],
    },
    select: { id: true, deletedAt: true },
    orderBy: { deletedAt: 'asc' },
  });
  return rows.flatMap((row) => (row.deletedAt ? [{ id: row.id, since: row.deletedAt }] : []));
}

export async function purgeOrphanedObjects(): Promise<PurgeOutcome> {
  const prisma = getPrisma();
  const purged: string[] = [];
  const failed: string[] = [];

  for (const candidate of await findOrphanedObjects()) {
    try {
      const video = await prisma.video.findUnique({
        where: { id: candidate.id },
        select: VIDEO_ASSET_SELECT,
      });
      if (!video) continue;
      for (const key of assetKeysOf(video)) {
        await deleteObject(key);
      }
      // 키를 비워야 다음 실행에서 다시 걸리지 않는다. 삭제 사유는 원래 값을 유지한다.
      await prisma.video.update({
        where: { id: video.id },
        data: {
          purgedAt: new Date(),
          s3Key: null,
          originalS3Keys: [],
          editedS3Key: null,
          thumbnailS3Key: null,
          originalUrls: [],
          editedUrl: null,
          thumbnailUrl: null,
        },
      });
      purged.push(video.id);
    } catch (err) {
      captureException(err, { videoId: candidate.id, phase: 'orphaned-object-purge' });
      failed.push(candidate.id);
    }
  }
  return { purged, failed };
}
