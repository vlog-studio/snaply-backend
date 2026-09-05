import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess, cursorPaginated } from './common.js';
import { defineRoute } from './define-route.js';
import { stylePresetSchema, videoKindSchema, videoStatusSchema } from './vocab.js';

export const VIDEO_LIST_DEFAULT_LIMIT = 20;
export const VIDEO_LIST_MAX_LIMIT = 50;

export const videoSchema = z
  .object({
    id: z.uuid(),
    kind: videoKindSchema,
    originalUrls: z.array(z.string()),
    editedUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    durationSeconds: z.int().nullable(),
    stylePreset: stylePresetSchema.nullable(),
    status: videoStatusSchema,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Video' });
export type Video = z.infer<typeof videoSchema>;

export const videoPageSchema = cursorPaginated(videoSchema);
export type VideoPage = z.infer<typeof videoPageSchema>;

export const uploadTargetSchema = z.object({
  videoId: z.uuid(),
  uploadUrl: z.string(),
  s3Key: z.string(),
});
export type UploadTarget = z.infer<typeof uploadTargetSchema>;

export const deletedSchema = z.object({ deleted: z.literal(true) });

export const uploadUrlQuerySchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .describe('원본 파일명. 확장자로 S3 키를 만드는 데만 쓰이고, 저장 이름은 `{videoId}.{ext}`로 대체된다.')
    .meta({ examples: ['clip1.mp4'] }),
  contentType: z
    .string()
    .min(1)
    .max(100)
    .describe(
      'MIME 타입. presigned 서명에 포함되므로 **실제 PUT의 `Content-Type` 헤더와 반드시 일치**해야 한다(다르면 S3가 403).',
    )
    .meta({ examples: ['video/mp4'] }),
});
export type UploadUrlQuery = z.infer<typeof uploadUrlQuerySchema>;

export const createVideoBodySchema = z.object({
  videoId: z.uuid().describe('`GET /videos/upload-url` 응답으로 받은 `videoId`. 본인 소유가 아니면 404.'),
  durationSeconds: z
    .int()
    .min(0)
    .max(86400)
    .optional()
    .describe(
      '영상 길이(초). 선택값 — 클라이언트가 아는 값을 그대로 저장할 뿐 서버가 검증하지 않는다. 생략하면 `null`.',
    )
    .meta({ examples: [12] }),
});
export type CreateVideoBody = z.infer<typeof createVideoBodySchema>;

export const listVideosQuerySchema = z.object({
  kind: videoKindSchema
    .optional()
    .describe('영상 종류 필터. `source`=직접 업로드한 원본, `result`=편집 결과물. 생략하면 전체.'),
  cursor: z
    .string()
    .optional()
    .describe('이전 응답의 `nextCursor`(마지막 항목 id). 첫 페이지는 생략. 해당 항목 **다음**부터 반환한다.'),
  limit: z.coerce
    .number<number>()
    .int()
    .min(1)
    .max(VIDEO_LIST_MAX_LIMIT)
    .optional()
    .describe(`한 페이지 개수. 기본 ${VIDEO_LIST_DEFAULT_LIMIT}, 최대 ${VIDEO_LIST_MAX_LIMIT}.`)
    .meta({ examples: [VIDEO_LIST_DEFAULT_LIMIT] }),
});
export type ListVideosQuery = z.infer<typeof listVideosQuerySchema>;

/** 경로의 영상 id. 형식은 검증하지 않는다 — 존재하지 않는 id 는 형식이 어떻든 404 다. */
const videoIdParamsSchema = z.object({ id: z.string().describe('영상 id(uuid)') });

export const getUploadUrl = defineRoute({
  method: 'GET',
  path: '/videos/upload-url',
  schema: {
    querystring: uploadUrlQuerySchema,
    response: {
      200: apiSuccess(uploadTargetSchema),
      400: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const createVideo = defineRoute({
  method: 'POST',
  path: '/videos',
  schema: {
    body: createVideoBodySchema,
    response: {
      201: apiSuccess(videoSchema),
      400: apiErrorSchema,
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const listVideos = defineRoute({
  method: 'GET',
  path: '/videos',
  schema: {
    querystring: listVideosQuerySchema,
    response: {
      200: apiSuccess(videoPageSchema),
      400: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getVideo = defineRoute({
  method: 'GET',
  path: '/videos/{id}',
  schema: {
    params: videoIdParamsSchema,
    response: {
      200: apiSuccess(videoSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const deleteVideo = defineRoute({
  method: 'DELETE',
  path: '/videos/{id}',
  schema: {
    params: videoIdParamsSchema,
    response: {
      200: apiSuccess(deletedSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
