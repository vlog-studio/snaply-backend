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

function toDto(row: MovieRow): Movie {
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
}): Promise<ClipInput[]> {
  if (params.clips.length < MOVIE_CLIP_MIN || params.clips.length > MOVIE_CLIP_MAX) {
    throw AppError.badRequest(
      `컷은 ${MOVIE_CLIP_MIN}개 이상 ${MOVIE_CLIP_MAX}개 이하로 담아야 합니다.`,
    );
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

async function findOwned(userId: string, movieId: string): Promise<MovieRow> {
  const row = await getPrisma().movie.findFirst({
    where: { id: movieId, userId, deletedAt: null },
    select: SELECT,
  });
  if (!row) {
    throw AppError.notFound('무비를 찾을 수 없습니다.');
  }
  return row as MovieRow;
}

export async function createMovie(params: {
  userId: string;
  title?: string;
  clips?: ClipInput[];
  stylePreset?: StylePreset;
  captions?: boolean;
  arranger?: MovieArranger;
}): Promise<Movie> {
  const arranger = params.arranger ?? 'user';
  const clips = params.clips ? await resolveClips({ ...params, clips: params.clips, arranger }) : [];

  const created = await getPrisma().movie.create({
    data: {
      userId: params.userId,
      title: params.title ?? DEFAULT_TITLE,
      stylePreset: params.stylePreset ?? DEFAULT_STYLE,
      captions: params.captions ?? false,
      arranger,
      clips: { create: clipCreateData(clips) },
    },
    select: SELECT,
  });
  return toDto(created as MovieRow);
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
  return {
    items: items.map((row) => toDto(row as MovieRow)),
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
      : await resolveClips({ userId: params.userId, clips: params.clips, arranger });

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
  return toDto(updated as MovieRow);
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
export async function finishMovie(params: {
  userId: string;
  movieId: string;
}): Promise<{ finishedAt: string; resultDeleted: boolean }> {
  const movie = await findOwned(params.userId, params.movieId);
  if (movie.status === 'generating') {
    throw AppError.conflict('생성 중인 무비는 끝낼 수 없습니다.');
  }

  const prisma = getPrisma();
  const result = movie.resultVideoId
    ? await prisma.video.findFirst({
        where: { id: movie.resultVideoId, userId: params.userId },
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
      data: { deletedAt: new Date(), editedUrl: null, thumbnailUrl: null },
    });
    resultDeleted = true;
  }

  const finishedAt = new Date();
  await prisma.movie.update({
    where: { id: movie.id },
    // 결과물 포인터를 비운다 — 파일이 사라졌으므로 무비는 다시 초안이다.
    data: { finishedAt, resultVideoId: null, status: 'draft' },
  });
  return { finishedAt: finishedAt.toISOString(), resultDeleted };
}
