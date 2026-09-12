import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess, cursorPaginated } from './common.js';
import { defineRoute } from './define-route.js';
import {
  MOVIE_CLIP_MAX,
  MOVIE_CLIP_MIN,
  movieArrangerSchema,
  movieStatusSchema,
  stylePresetSchema,
} from './vocab.js';

export const MOVIE_LIST_DEFAULT_LIMIT = 20;
export const MOVIE_LIST_MAX_LIMIT = 50;

/**
 * 무비 안의 컷 하나 — 어떤 스냅을 어느 구간으로 쓰는지.
 *
 * 순서는 배열의 순서다. 서버가 `order` 를 따로 돌려주지 않는 이유는 두 표현이 어긋날 수
 * 있기 때문이고, 저장할 때도 배열 순서를 그대로 0..n 으로 매긴다.
 */
export const movieClipSchema = z
  .object({
    videoId: z.uuid().describe('컷이 참조하는 스냅(`kind: source`)의 id.'),
    startMs: z
      .int()
      .min(0)
      .optional()
      .describe('트림 시작(밀리초). 생략하면 처음부터.'),
    endMs: z.int().min(1).optional().describe('트림 끝(밀리초). 생략하면 끝까지.'),
    /**
     * 스냅이 만료·삭제돼 더 이상 재생할 수 없는 컷. 무비는 그래도 열려야 하므로
     * (specs/snap-library.md SNAP-12) 컷을 빼는 대신 이 표시를 붙여 돌려준다.
     */
    unavailable: z
      .boolean()
      .describe('참조하던 스냅이 사라진 컷. `true` 면 재생할 수 없고 편집에서 빼야 한다.'),
  })
  .meta({ id: 'MovieClip' });
export type MovieClip = z.infer<typeof movieClipSchema>;

export const movieSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    status: movieStatusSchema,
    stylePreset: stylePresetSchema,
    captions: z.boolean().describe('생성 시 소프트 자막을 만들지 여부.'),
    ratio: z.string().describe('출력 비율. 현재는 `9:16` 뿐이다.'),
    arranger: movieArrangerSchema,
    clips: z.array(movieClipSchema).describe('컷 목록. **배열 순서가 곧 재생 순서**다.'),
    /**
     * 살아 있는 결과물. 끝내기(specs/movie.md MOV-17)나 보관 상한(MOV-16)으로 파일이
     * 사라지면 `null` 로 돌아간다 — 그때도 무비 자체는 남아 다시 만들 수 있다.
     */
    resultVideoId: z.uuid().nullable().describe('완성된 결과물 영상 id. 없으면 `null`.'),
    /**
     * 결과물을 만든(만들고 있는) 편집 작업. 무비 API 는 진행률·실패 사유를 직접 주지 않으므로
     * 앱은 이 id 로 `GET /edit-jobs/{id}` · WebSocket 을 연다. 앱이 `export` 응답의 `jobId` 를
     * 재시작으로 잃어도 여기서 다시 찾는다 — 없으면 무비가 `generating` 에 갇힌 채 진행률을
     * 볼 길이 없다. `resultVideoId` 와 함께 비워진다.
     */
    jobId: z.uuid().nullable().describe('결과물을 만든(만들고 있는) 편집 작업 id. 진행률·취소·실패 사유는 편집 작업 API 로 본다. 없으면 `null`.'),
    finishedAt: z.iso
      .datetime()
      .nullable()
      .describe('사용자가 다운로드·게시로 끝낸 시각. 끝낸 뒤에도 무비는 계속 편집할 수 있다.'),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime().describe('마지막 편집 시각. 스튜디오 보드가 이 값으로 정렬한다.'),
  })
  .meta({ id: 'Movie' });
export type Movie = z.infer<typeof movieSchema>;

export const moviePageSchema = cursorPaginated(movieSchema);
export type MoviePage = z.infer<typeof moviePageSchema>;

/** 컷을 쓰거나 고칠 때 보내는 형태. 응답의 `unavailable` 은 서버가 판정하므로 받지 않는다. */
const clipInputSchema = z.object({
  videoId: z.uuid(),
  startMs: z.int().min(0).optional(),
  endMs: z.int().min(1).optional(),
});

const clipsInputSchema = z
  .array(clipInputSchema)
  .min(MOVIE_CLIP_MIN)
  .max(MOVIE_CLIP_MAX)
  .describe(
    `컷 목록. **배열 순서가 곧 재생 순서**다. ${MOVIE_CLIP_MIN}~${MOVIE_CLIP_MAX}개이며, 같은 스냅을 다른 구간으로 여러 번 쓸 수 있다.`,
  );

/**
 * 앱이 오프라인에서 먼저 만든 초안의 id 를 그대로 서버 id 로 쓴다.
 *
 * 무비는 기기에서 즉시 만들어지고(촬영 직후 담기) 스냅 업로드가 끝난 뒤에 서버로 올라오므로,
 * 서버가 id 를 새로 매기면 앱이 이미 화면·알림·경로에 쓰고 있는 id 가 바뀐다. 같은 id 로
 * 다시 보내면(네트워크 실패 뒤 재시도) 새로 만들지 않고 있는 것을 돌려준다 — 멱등이다.
 */
export const createMovieBodySchema = z.object({
  id: z
    .uuid()
    .optional()
    .describe(
      '앱이 정한 무비 id(uuid). 생략하면 서버가 정한다. 내 무비에 같은 id 가 이미 있으면 새로 만들지 않고 그것을 돌려준다(멱등). 다른 사용자의 id 와 겹치면 409.',
    ),
  title: z.string().min(1).max(100).optional().describe('무비 이름. 생략하면 서버가 정한다.'),
  clips: clipsInputSchema.optional().describe('처음부터 컷을 담아 만들 때. 생략하면 빈 초안이 된다.'),
  stylePreset: stylePresetSchema.optional().describe('편집 스타일. 생략하면 `일상`.'),
  captions: z.boolean().optional().describe('소프트 자막 생성 여부. 생략하면 `false`(쇼츠용).'),
  arranger: movieArrangerSchema
    .optional()
    .describe(
      '컷 순서의 주인. `ai` 면 서버가 촬영 시각 순으로 정렬하고, 사용자가 순서를 바꾸면 `user` 로 굳는다. 생략하면 `user`.',
    ),
});
export type CreateMovieBody = z.infer<typeof createMovieBodySchema>;

export const updateMovieBodySchema = z
  .object({
    title: z.string().min(1).max(100).optional(),
    clips: z
      .array(clipInputSchema)
      .max(MOVIE_CLIP_MAX)
      .optional()
      .describe(
        '보내면 컷 목록을 통째로 교체한다(부분 수정이 아니다). 빈 배열이면 컷 없는 초안으로 돌아간다 — 마지막 스냅을 지운 무비도 남아야 하기 때문이다. 컷이 없으면 생성(export)은 400.',
      ),
    stylePreset: stylePresetSchema.optional(),
    captions: z.boolean().optional(),
    arranger: movieArrangerSchema.optional(),
  })
  .describe('보낸 필드만 바꾼다. 생성 중(`generating`)인 무비는 수정할 수 없다(409).');
export type UpdateMovieBody = z.infer<typeof updateMovieBodySchema>;

export const listMoviesQuerySchema = z.object({
  status: movieStatusSchema.optional().describe('상태 필터. 생략하면 전체.'),
  cursor: z.string().optional(),
  limit: z.coerce
    .number<number>()
    .int()
    .min(1)
    .max(MOVIE_LIST_MAX_LIMIT)
    .optional()
    .describe(`한 페이지 개수. 기본 ${MOVIE_LIST_DEFAULT_LIMIT}, 최대 ${MOVIE_LIST_MAX_LIMIT}.`),
});
export type ListMoviesQuery = z.infer<typeof listMoviesQuerySchema>;

/** 경로의 무비 id. 형식은 검증하지 않는다 — 존재하지 않는 id 는 형식이 어떻든 404 다. */
const movieIdParamsSchema = z.object({ id: z.string().describe('무비 id(uuid)') });

export const movieExportResultSchema = z
  .object({ jobId: z.uuid().describe('생성 작업 id. 진행률은 편집 작업 API·WebSocket 으로 본다.') })
  .meta({ id: 'MovieExportResult' });

export const finishMovieResultSchema = z
  .object({
    finishedAt: z.iso.datetime(),
    resultDeleted: z
      .boolean()
      .describe('이 호출로 결과물 파일이 삭제됐는지. 이미 없었다면 `false`.'),
  })
  .meta({ id: 'MovieFinishResult' });

export const createMovie = defineRoute({
  method: 'POST',
  path: '/movies',
  schema: {
    body: createMovieBodySchema,
    response: {
      201: apiSuccess(movieSchema),
      400: apiErrorSchema,
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const listMovies = defineRoute({
  method: 'GET',
  path: '/movies',
  schema: {
    querystring: listMoviesQuerySchema,
    response: {
      200: apiSuccess(moviePageSchema),
      400: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getMovie = defineRoute({
  method: 'GET',
  path: '/movies/{id}',
  schema: {
    params: movieIdParamsSchema,
    response: {
      200: apiSuccess(movieSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const updateMovie = defineRoute({
  method: 'PATCH',
  path: '/movies/{id}',
  schema: {
    params: movieIdParamsSchema,
    body: updateMovieBodySchema,
    response: {
      200: apiSuccess(movieSchema),
      400: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const deleteMovie = defineRoute({
  method: 'DELETE',
  path: '/movies/{id}',
  schema: {
    params: movieIdParamsSchema,
    response: {
      200: apiSuccess(z.object({ deleted: z.literal(true) })),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const exportMovie = defineRoute({
  method: 'POST',
  path: '/movies/{id}/export',
  schema: {
    params: movieIdParamsSchema,
    response: {
      202: apiSuccess(movieExportResultSchema),
      400: apiErrorSchema,
      402: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const finishMovie = defineRoute({
  method: 'POST',
  path: '/movies/{id}/finish',
  schema: {
    params: movieIdParamsSchema,
    response: {
      200: apiSuccess(finishMovieResultSchema),
      404: apiErrorSchema,
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
