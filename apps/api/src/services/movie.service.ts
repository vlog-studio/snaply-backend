import {
  DEFAULT_FIT_MODE,
  DEFAULT_OUTPUT_PROFILE,
  MOVIE_CLIP_MAX,
  MOVIE_CLIP_MIN,
  type CursorPaginated,
  type Movie,
  type MovieArranger,
  type MovieStatus,
  type StylePreset,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { createEditJob } from './edit-job.service.js';
import { deleteObject } from './storage.service.js';

const DEFAULT_TITLE = '새 무비';
const DEFAULT_STYLE: StylePreset = '일상';

export interface ClipInput {
  videoId: string;
  startMs?: number;
  endMs?: number;
}

/**
 * 컷이 참조하는 스냅의 상태. 만료·삭제된 스냅은 툼스톤으로 남으므로 컷도 남고, 그 사실만
 * 응답에 표시된다(specs/snap-library.md SNAP-12) — 컷 하나가 사라져도 무비는 열려야 한다.
 */
interface ClipRow {
  videoId: string;
  order: number;
  startMs: number | null;
  endMs: number | null;
  video: { deletedAt: Date | null; status: string };
}

interface MovieRow {
  id: string;
  title: string;
  status: string;
  stylePreset: string;
  captions: boolean;
  ratio: string;
  arranger: string;
  resultVideoId: string | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  clips: ClipRow[];
}

/** 결과물 영상에 걸린 가장 최근 편집 작업. 무비 상태 보정과 응답의 `jobId` 가 함께 쓴다. */
interface LatestJob {
  id: string;
  status: string;
}

type MovieRowWithJob = MovieRow & { job: LatestJob | null };

const SELECT = {
  id: true,
  title: true,
  status: true,
  stylePreset: true,
  captions: true,
  ratio: true,
  arranger: true,
  resultVideoId: true,
  finishedAt: true,
  createdAt: true,
  updatedAt: true,
  clips: {
    orderBy: { order: 'asc' },
    select: {
      videoId: true,
      order: true,
      startMs: true,
      endMs: true,
      video: { select: { deletedAt: true, status: true } },
    },
  },
} as const;

function toDto(row: MovieRowWithJob): Movie {
  return {
    id: row.id,
    title: row.title,
    status: row.status as MovieStatus,
    stylePreset: row.stylePreset as StylePreset,
    captions: row.captions,
    ratio: row.ratio,
    arranger: row.arranger as MovieArranger,
    clips: row.clips.map((clip) => ({
      videoId: clip.videoId,
      ...(clip.startMs !== null ? { startMs: clip.startMs } : {}),
      ...(clip.endMs !== null ? { endMs: clip.endMs } : {}),
      unavailable: clip.video.deletedAt !== null || clip.video.status !== 'ready',
    })),
    resultVideoId: row.resultVideoId,
    jobId: row.job?.id ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 컷이 이 사용자의 쓸 수 있는 스냅을 가리키는지 확인하고, 저장할 순서대로 돌려준다.
 *
 * 순서 규칙(decisions/movie-export-policy.md ①): `arranger` 가 `ai` 일 때만 촬영 시각 순으로
 * 정렬한다. 사용자가 순서를 잡은 무비(`user`)는 보낸 배열 순서를 그대로 쓴다 — 서버가 다시
 * 정렬하면 사용자가 의도적으로 옮긴 컷이 되돌아간다.
 * `capturedAt` 은 전달 이전에 올라온 스냅에 없으므로(SNAP-10) 없으면 업로드 시각으로 대신한다.
 */
async function resolveClips(params: {
  userId: string;
  clips: ClipInput[];
  arranger: MovieArranger;
  /** 수정은 컷을 모두 빼는 것도 허용한다 — 마지막 스냅을 지운 무비도 초안으로 남아야 한다. */
  allowEmpty?: boolean;
}): Promise<ClipInput[]> {
  const min = params.allowEmpty ? 0 : MOVIE_CLIP_MIN;
  if (params.clips.length < min || params.clips.length > MOVIE_CLIP_MAX) {
    throw AppError.badRequest(
      `컷은 ${MOVIE_CLIP_MIN}개 이상 ${MOVIE_CLIP_MAX}개 이하로 담아야 합니다.`,
    );
  }
  if (params.clips.length === 0) {
    return [];
  }
  for (const clip of params.clips) {
    if (clip.endMs !== undefined && clip.startMs !== undefined && clip.endMs <= clip.startMs) {
      throw AppError.badRequest('컷 종료 시간은 시작 시간보다 커야 합니다.');
    }
  }

  const uniqueIds = [...new Set(params.clips.map((clip) => clip.videoId))];
  const snaps = await getPrisma().video.findMany({
    where: { id: { in: uniqueIds }, userId: params.userId, deletedAt: null, kind: 'source' },
    select: { id: true, capturedAt: true, createdAt: true },
  });
  if (snaps.length !== uniqueIds.length) {
    throw AppError.forbidden('무비에 담을 수 없는 스냅이 포함되어 있습니다. (소유권 확인)');
  }

  if (params.arranger === 'user') {
    return params.clips;
  }

  const timeOf = new Map(
    snaps.map((snap) => [snap.id, (snap.capturedAt ?? snap.createdAt).getTime()]),
  );
  // 같은 시각이면 보낸 순서를 유지해야 정렬이 안정적이다.
  return params.clips
    .map((clip, index) => ({ clip, index }))
    .sort(
      (left, right) =>
        (timeOf.get(left.clip.videoId) ?? 0) - (timeOf.get(right.clip.videoId) ?? 0) ||
        left.index - right.index,
    )
    .map((entry) => entry.clip);
}

function clipCreateData(clips: ClipInput[]) {
  return clips.map((clip, index) => ({
    videoId: clip.videoId,
    order: index,
    startMs: clip.startMs ?? null,
    endMs: clip.endMs ?? null,
  }));
}

/**
 * 결과물 영상마다 가장 최근 편집 작업을 한 번의 조회로 붙인다.
 *
 * 목록은 무비 수만큼 작업을 따로 묻지 않는다 — 결과물 id 를 모아 한 번에 읽고, 영상별로
 * 가장 최근 것만 남긴다(다시 만들기는 결과물을 교체하므로 보통 하나지만, 같은 결과물에 작업이
 * 둘 이상 걸린 경우에도 최신이 이긴다).
 */
async function attachLatestJobs(rows: MovieRow[]): Promise<MovieRowWithJob[]> {
  const videoIds = [
    ...new Set(rows.map((row) => row.resultVideoId).filter((id): id is string => id !== null)),
  ];
  const jobs =
    videoIds.length === 0
      ? []
      : await getPrisma().editJob.findMany({
          where: { videoId: { in: videoIds } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, videoId: true, status: true },
        });
  const latestByVideo = new Map<string, LatestJob>();
  for (const job of jobs) {
    if (!latestByVideo.has(job.videoId)) {
      latestByVideo.set(job.videoId, { id: job.id, status: job.status });
    }
  }
  return rows.map((row) => ({
    ...row,
    job: row.resultVideoId ? (latestByVideo.get(row.resultVideoId) ?? null) : null,
  }));
}

/**
 * `generating` 인 무비의 상태를 편집 작업의 결과로 따라잡는다.
 *
 * 워커는 무비를 모른다 — `edit_jobs` 와 결과물 `videos` 만 갱신한다. 그래서 무비 상태를
 * 워커가 옮겨줄 수 없고, 읽는 시점에 작업을 보고 맞춘다. 이 보정이 없으면 무비가 영원히
 * `generating` 에 갇혀 수정도 끝내기도 409 가 된다.
 *
 * 취소는 실패가 아니다(specs/movie.md MOV-11) — 사용자가 멈춘 작업은 무비를 **초안**으로
 * 되돌리고, 취소 시 지워진 결과물의 포인터도 함께 비운다. 앱도 취소를 초안으로 다루므로
 * 서버가 `failed` 라 하면 두 쪽이 서로 고치려 든다.
 *
 * 값이 실제로 바뀔 때만 UPDATE 한다 — `updatedAt` 은 스튜디오 보드의 정렬 기준이라
 * 조회할 때마다 건드리면 목록 순서가 흔들린다.
 */
async function reconcileStatus(row: MovieRowWithJob): Promise<MovieRowWithJob> {
  if (row.status !== 'generating' || !row.job) {
    return row;
  }
  if (row.job.status === 'canceled') {
    await getPrisma().movie.update({
      where: { id: row.id },
      data: { status: 'draft', resultVideoId: null, updatedAt: row.updatedAt },
    });
    return { ...row, status: 'draft', resultVideoId: null, job: null };
  }
  const next =
    row.job.status === 'done' ? 'ready' : row.job.status === 'failed' ? 'failed' : null;
  if (next === null) {
    return row;
  }
  await getPrisma().movie.update({
    where: { id: row.id },
    data: { status: next, updatedAt: row.updatedAt },
  });
  return { ...row, status: next };
}

/** 응답으로 나가기 전에 거치는 두 단계 — 작업을 붙이고, 그 작업으로 상태를 맞춘다. */
async function settle(rows: MovieRow[]): Promise<MovieRowWithJob[]> {
  const withJobs = await attachLatestJobs(rows);
  return await Promise.all(withJobs.map(reconcileStatus));
}

async function findOwned(userId: string, movieId: string): Promise<MovieRowWithJob> {
  const row = await getPrisma().movie.findFirst({
    where: { id: movieId, userId, deletedAt: null },
    select: SELECT,
  });
  if (!row) {
    throw AppError.notFound('무비를 찾을 수 없습니다.');
  }
  const [settled] = await settle([row as MovieRow]);
  return settled!;
}

/**
 * 무비를 만든다. 앱이 `id` 를 정해 보내면 그 id 로 만든다 — 앱은 오프라인에서 초안을 먼저
 * 만들고 스냅 업로드가 끝난 뒤 올리므로, 서버가 id 를 새로 매기면 앱이 이미 쓰는 id 가 바뀐다.
 *
 * **같은 id 로 다시 오면 멱등이다**: 내 무비에 이미 있으면 새로 만들지 않고 그것을 돌려준다
 * (네트워크 실패 뒤 재시도가 두 번째 무비를 만들면 안 된다). 다른 사용자의 무비 id 와 겹치면
 * 409 — 존재 여부를 굳이 숨기지 않는 이유는, uuid 충돌은 사고가 아니라 조작이기 때문이다.
 */
export async function createMovie(params: {
  userId: string;
  id?: string;
  title?: string;
  clips?: ClipInput[];
  stylePreset?: StylePreset;
  captions?: boolean;
  arranger?: MovieArranger;
}): Promise<Movie> {
  if (params.id) {
    const existing = await getPrisma().movie.findUnique({
      where: { id: params.id },
      select: { userId: true, deletedAt: true },
    });
    if (existing && existing.userId !== params.userId) {
      throw AppError.conflict('이미 쓰이고 있는 무비 id 입니다.');
    }
    if (existing && existing.deletedAt === null) {
      return await getMovie({ userId: params.userId, movieId: params.id });
    }
    if (existing) {
      // 지운 무비의 id 로 다시 만들려는 재시도 — 지운 것은 지운 것이다.
      throw AppError.conflict('삭제된 무비의 id 입니다.');
    }
  }

  const arranger = params.arranger ?? 'user';
  const clips = params.clips ? await resolveClips({ ...params, clips: params.clips, arranger }) : [];

  const created = await getPrisma().movie.create({
    data: {
      ...(params.id ? { id: params.id } : {}),
      userId: params.userId,
      title: params.title ?? DEFAULT_TITLE,
      stylePreset: params.stylePreset ?? DEFAULT_STYLE,
      captions: params.captions ?? false,
      arranger,
      clips: { create: clipCreateData(clips) },
    },
    select: SELECT,
  });
  // 새 무비에는 결과물이 없으니 작업도 없다 — 조회 없이 비운다.
  return toDto({ ...(created as MovieRow), job: null });
}

export async function listMovies(params: {
  userId: string;
  status?: MovieStatus;
  cursor?: string;
  limit: number;
}): Promise<CursorPaginated<Movie>> {
  const rows = await getPrisma().movie.findMany({
    where: {
      userId: params.userId,
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
    },
    // 스튜디오 보드는 "최근 손댄 것"부터 보여준다.
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: SELECT,
  });

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  const settled = await settle(items as MovieRow[]);
  return {
    items: settled.map(toDto),
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

export async function getMovie(params: { userId: string; movieId: string }): Promise<Movie> {
  return toDto(await findOwned(params.userId, params.movieId));
}

export async function updateMovie(params: {
  userId: string;
  movieId: string;
  title?: string;
  clips?: ClipInput[];
  stylePreset?: StylePreset;
  captions?: boolean;
  arranger?: MovieArranger;
}): Promise<Movie> {
  const current = await findOwned(params.userId, params.movieId);
  // 생성 중에는 편집을 막는다 — 진행 중인 작업이 더 이상 존재하지 않는 컷 목록을 설명하게 된다
  // (specs/movie.md MOV-4).
  if (current.status === 'generating') {
    throw AppError.conflict('생성 중인 무비는 수정할 수 없습니다.');
  }

  const arranger = params.arranger ?? (current.arranger as MovieArranger);
  const clips =
    params.clips === undefined
      ? undefined
      : await resolveClips({
          userId: params.userId,
          clips: params.clips,
          arranger,
          allowEmpty: true,
        });

  const updated = await getPrisma().movie.update({
    where: { id: current.id },
    data: {
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.stylePreset !== undefined ? { stylePreset: params.stylePreset } : {}),
      ...(params.captions !== undefined ? { captions: params.captions } : {}),
      ...(params.arranger !== undefined ? { arranger: params.arranger } : {}),
      // 컷은 통째로 교체한다. 부분 갱신은 순서를 다시 계산해야 해서 두 표현이 어긋나기 쉽다.
      ...(clips !== undefined
        ? { clips: { deleteMany: {}, create: clipCreateData(clips) } }
        : {}),
    },
    select: SELECT,
  });
  // 수정은 결과물을 건드리지 않으므로 방금 읽은 작업이 그대로 유효하다.
  return toDto({ ...(updated as MovieRow), job: current.job });
}

/**
 * 무비를 지운다. **참조하던 스냅은 그대로 둔다**(decisions/movie-export-policy.md ③) —
 * 한 스냅을 여러 무비가 나눠 쓸 수 있으므로 함께 지우면 다른 무비의 컷이 사라진다.
 */
export async function deleteMovie(params: { userId: string; movieId: string }): Promise<void> {
  const current = await findOwned(params.userId, params.movieId);
  await getPrisma().movie.update({
    where: { id: current.id },
    data: { deletedAt: new Date() },
  });
}

/**
 * 무비를 생성 작업으로 보낸다. 편집 엔진은 그대로 재사용하고, 이 함수는 무비의 컷을
 * 편집 작업의 클립으로 옮겨 담는 일만 한다(decisions/movie-model.md 채택 근거).
 */
export async function exportMovie(params: {
  userId: string;
  movieId: string;
}): Promise<{ jobId: string }> {
  const movie = await findOwned(params.userId, params.movieId);
  if (movie.status === 'generating') {
    throw AppError.conflict('이미 생성 중인 무비입니다.');
  }
  if (movie.clips.length === 0) {
    throw AppError.badRequest('컷이 없는 무비는 생성할 수 없습니다.');
  }
  const unavailable = movie.clips.filter(
    (clip) => clip.video.deletedAt !== null || clip.video.status !== 'ready',
  );
  if (unavailable.length > 0) {
    throw AppError.badRequest(
      '사용할 수 없는 컷이 있습니다. 만료되었거나 삭제된 스냅을 빼고 다시 시도하세요.',
    );
  }

  const { jobId, videoId } = await createEditJob({
    userId: params.userId,
    clips: movie.clips.map((clip) => ({
      videoId: clip.videoId,
      startMs: clip.startMs ?? 0,
      ...(clip.endMs !== null ? { endMs: clip.endMs } : {}),
    })),
    stylePreset: movie.stylePreset as StylePreset,
    outputProfile: DEFAULT_OUTPUT_PROFILE,
    fitMode: DEFAULT_FIT_MODE,
    subtitles: movie.captions,
  });

  await getPrisma().movie.update({
    where: { id: movie.id },
    data: {
      status: 'generating',
      // 다시 만들면 이전 결과물을 대신한다(movie-export-policy ②: 누적이 아니라 교체).
      resultVideoId: videoId,
      // 새로 만들었으므로 "끝냈다"는 사실도 초기화된다.
      finishedAt: null,
    },
  });
  return { jobId };
}

/**
 * 사용자가 결과물을 가져갔음을 확정하고 서버의 파일을 지운다(specs/movie.md MOV-17).
 *
 * **끝났다는 판정은 추측하지 않는다**(MOV-18): 시스템 공유 시트는 사용자가 실제로 저장했는지
 * 알려주지 않으므로, 이 호출은 사용자의 명시적 행동이거나 서버가 성공을 확인한 SNS 게시여야 한다.
 * 프로젝트(무비)는 남으므로 끝낸 뒤에도 고쳐서 다시 만들 수 있다 — 그것은 새 생성이다(MOV-19).
 */
/**
 * 끝내기의 실제 동작 — 결과물 파일을 지우고 무비를 초안으로 되돌린다.
 *
 * 두 진입점이 이것을 나눠 쓴다: 사용자의 명시적 행동(`POST /movies/{id}/finish`)과
 * SNS 게시 성공(서버가 플랫폼 응답을 직접 본 경우). 어느 쪽이든 **무비는 남는다** —
 * 사라지는 것은 파일이고, 레시피가 남아 고쳐서 다시 만들 수 있다(새 생성이라 유료, MOV-19).
 */
async function applyFinish(params: {
  userId: string;
  movieId: string;
  resultVideoId: string | null;
}): Promise<{ finishedAt: string; resultDeleted: boolean }> {
  const prisma = getPrisma();
  const result = params.resultVideoId
    ? await prisma.video.findFirst({
        where: { id: params.resultVideoId, userId: params.userId },
        select: { id: true, editedS3Key: true, thumbnailS3Key: true },
      })
    : null;

  let resultDeleted = false;
  if (result) {
    // S3 삭제가 실패해도 끝내기 자체는 되돌리지 않는다 — 남은 객체는 정리 배치가 회수한다
    // (backlog E-3). 여기서 예외를 던지면 사용자는 이미 파일을 가져갔는데 화면은 실패로 남는다.
    for (const key of [result.editedS3Key, result.thumbnailS3Key]) {
      if (!key) continue;
      try {
        await deleteObject(key);
      } catch {
        /* 정리 배치가 회수한다 */
      }
    }
    await prisma.video.update({
      where: { id: result.id },
      // 사용자가 가져가서 지운 것이므로 사유는 `user` 다. `purgedAt` 이 있으면 남은 객체
      // 정리 배치가 다시 훑지 않는다.
      data: {
        deletedAt: new Date(),
        removalReason: 'user',
        purgedAt: new Date(),
        editedUrl: null,
        thumbnailUrl: null,
      },
    });
    resultDeleted = true;
  }

  const finishedAt = new Date();
  await prisma.movie.update({
    where: { id: params.movieId },
    // 결과물 포인터를 비운다 — 파일이 사라졌으므로 무비는 다시 초안이다.
    data: { finishedAt, resultVideoId: null, status: 'draft' },
  });
  return { finishedAt: finishedAt.toISOString(), resultDeleted };
}

export async function finishMovie(params: {
  userId: string;
  movieId: string;
}): Promise<{ finishedAt: string; resultDeleted: boolean }> {
  const movie = await findOwned(params.userId, params.movieId);
  if (movie.status === 'generating') {
    throw AppError.conflict('생성 중인 무비는 끝낼 수 없습니다.');
  }
  return await applyFinish({
    userId: params.userId,
    movieId: movie.id,
    resultVideoId: movie.resultVideoId,
  });
}

/**
 * 결과물 영상을 단서로 그 무비를 끝낸다 — **SNS 게시 성공 경로 전용**이다.
 *
 * 다운로드 경로가 사용자의 명시적 행동을 요구하는 이유(시스템 공유 시트는 저장 여부를
 * 알려주지 않는다, MOV-18)가 여기에는 해당하지 않는다. 서버가 플랫폼의 성공 응답을 직접
 * 봤으므로 추측이 아니다.
 *
 * **호출자의 동작을 막지 않는다.** 게시는 이미 성공했고 그 사실은 `sns_uploads` 에 남았다 —
 * 여기서 예외를 던지면 성공한 게시가 실패로 보고된다. 무비가 없거나(직접 편집 API 로 만든
 * 결과물) 이미 끝난 경우도 조용히 넘어간다.
 */
export async function finishMovieForResult(params: {
  userId: string;
  resultVideoId: string;
}): Promise<void> {
  try {
    const movie = await getPrisma().movie.findFirst({
      where: {
        userId: params.userId,
        resultVideoId: params.resultVideoId,
        deletedAt: null,
        finishedAt: null,
      },
      select: { id: true, resultVideoId: true },
    });
    if (!movie) {
      return;
    }
    await applyFinish({
      userId: params.userId,
      movieId: movie.id,
      resultVideoId: movie.resultVideoId,
    });
  } catch (err) {
    captureException(err, { resultVideoId: params.resultVideoId, phase: 'sns-auto-finish' });
  }
}
