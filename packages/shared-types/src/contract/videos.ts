import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess, cursorPaginated } from './common.js';
import { defineRoute } from './define-route.js';
import {
  stylePresetSchema,
  videoKindSchema,
  videoRemovalReasonSchema,
  videoStatusSchema,
} from './vocab.js';

export const VIDEO_LIST_DEFAULT_LIMIT = 20;
export const VIDEO_LIST_MAX_LIMIT = 50;
/** `POST /videos/lookup` 한 번에 물을 수 있는 id 수. */
export const VIDEO_LOOKUP_MAX_IDS = 100;
/** 앱이 붙이는 스냅 이름(`clientId`)의 최대 길이. */
export const VIDEO_CLIENT_ID_MAX_LENGTH = 128;

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
    playbackUrl: z
      .string()
      .nullable()
      .describe(
        '어디서나 재생되는 배포본(H.264/SDR)의 시한부 URL. 원본은 아이폰 HEVC/HDR 그대로라 플랫폼에 따라 재생되지 않을 수 있으므로 **재생에는 이 값을 우선 쓴다.** 아직 만들어지지 않았거나 변환에 실패하면 `null` 이고, 그때는 `originalUrls` 로 돌아간다.',
      ),
    durationMs: z
      .int()
      .nullable()
      .describe('서버가 실측한 길이(밀리초). 클라이언트가 보고한 `durationSeconds` 보다 정확하다.'),
    capturedAt: z.iso
      .datetime()
      .nullable()
      .describe(
        '촬영 시각. 클라이언트가 보고한 값이며, 전달되지 않은(또는 전달 이전에 업로드된) 영상은 `null`이다. 시간 기준 정렬·묶음의 원천이고, 없으면 `createdAt`으로 대신한다.',
      ),
    width: z
      .int()
      .nullable()
      .describe(
        '표시 기준 가로(회전 반영). 서버가 배포본에서 잰 값이라 `playbackUrl` 의 파일과 맞는다. 렌디션이 없거나 재지 못했으면 `null`.',
      ),
    height: z.int().nullable().describe('표시 기준 세로(회전 반영). `width` 와 같은 규칙.'),
    clientId: z
      .string()
      .nullable()
      .describe(
        '등록할 때 앱이 보낸 스냅 이름(`POST /videos` 의 `clientId`). 찍은 기기가 목록에서 자기 스냅을 알아보는 데 쓴다. **유일하지 않다.** 보내지 않았으면 `null`.',
      ),
    expiresAt: z.iso
      .datetime()
      .nullable()
      .describe(
        '서버 보관이 끝나는 시각 — 이 시각 뒤 첫 정리 배치에서 파일이 지워진다(SNAP-9). 업로드 시각과 현재 정책에서 매번 유도한 값이라, 정책이 바뀌면 같은 영상의 값도 바뀐다. 업로드가 끝난 원본(`kind: source`, `status: ready`)에만 있고 나머지는 `null`.',
      ),
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

export const deletedSchema = z.object({
  deleted: z.literal(true),
  restorableUntil: z.iso
    .datetime()
    .nullable()
    .describe(
      '되살릴 수 있는 마지막 시각 — 원래 보관 기간이 끝나는 때(SNAP-20). 서버에 사본이 없던 영상(올라가지 않은 스냅 · 보관 기간이 끝난 스냅 · 결과물)은 `null` 이고 되살릴 수 없다.',
    ),
});

/** 지운 스냅 하나 — 최근 삭제(휴지통)에 있는 동안만 보인다. 앱이 목록에 그릴 만큼만 싣는다. */
export const trashedSnapSchema = z
  .object({
    id: z.uuid(),
    clientId: z.string().nullable(),
    capturedAt: z.iso.datetime().nullable(),
    durationMs: z.int().nullable(),
    width: z.int().nullable(),
    height: z.int().nullable(),
    thumbnailUrl: z.string().nullable(),
    deletedAt: z.iso.datetime(),
    restorableUntil: z.iso.datetime().describe('이 시각이 지나면 정리 배치가 파일을 지우고 되살릴 수 없다.'),
  })
  .meta({ id: 'TrashedSnap' });
export type TrashedSnap = z.infer<typeof trashedSnapSchema>;

/** 휴지통은 원래 보관 기간(15일) 안의 스냅뿐이라 짧다. 그래도 한 번에 이만큼까지만 준다(지운 순서, 최근 것부터). */
export const TRASH_LIST_MAX = 200;

export const trashListSchema = z.object({ items: z.array(trashedSnapSchema) });
export type TrashList = z.infer<typeof trashListSchema>;

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
  capturedAt: z.iso
    .datetime()
    .optional()
    .describe(
      '촬영 시각(ISO 8601). 선택값이지만 **가능하면 항상 보낸다** — 서버가 소급해 알아낼 방법이 없어, 빠뜨린 영상은 영구히 `null`로 남고 시간 기준 정렬·묶음에서 `createdAt`(업로드 시각)으로 대신하게 된다.',
    )
    .meta({ examples: ['2026-09-09T04:15:30.000Z'] }),
  clientId: z
    .string()
    .min(1)
    .max(VIDEO_CLIENT_ID_MAX_LENGTH)
    .optional()
    .describe(
      '앱이 이 스냅에 붙인 이름(로컬 스냅 id). 선택값 — 목록의 `clientId` 로 그대로 돌아와, 등록 직후 앱이 기록을 잃어도 자기 스냅을 알아볼 수 있다. 서버는 해석하지 않고 유일성도 보장하지 않는다.',
    )
    .meta({ examples: ['snaply-1727400000000.mp4'] }),
});
export type CreateVideoBody = z.infer<typeof createVideoBodySchema>;

export const lookupVideosBodySchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(VIDEO_LOOKUP_MAX_IDS)
    .describe(`물어볼 영상 id. 최대 ${VIDEO_LOOKUP_MAX_IDS}개.`),
});
export type LookupVideosBody = z.infer<typeof lookupVideosBodySchema>;

export const VIDEO_LOOKUP_STATES = ['live', 'removed'] as const;

export const videoLookupItemSchema = z
  .object({
    id: z.uuid(),
    state: z
      .enum(VIDEO_LOOKUP_STATES)
      .describe('`live`=아직 있다(목록·상세에 나온다), `removed`=지워졌다(툼스톤만 남았다).'),
    removalReason: videoRemovalReasonSchema
      .nullable()
      .describe('`removed` 일 때 사라진 이유 — `user`=사용자가 지움, `expired`=보관 기간 만료. `live` 면 `null`.'),
    removedAt: z.iso.datetime().nullable().describe('`removed` 일 때 지워진 시각. `live` 면 `null`.'),
  })
  .meta({ id: 'VideoLookupItem' });
export type VideoLookupItem = z.infer<typeof videoLookupItemSchema>;

export const videoLookupSchema = z.object({ items: z.array(videoLookupItemSchema) });
export type VideoLookup = z.infer<typeof videoLookupSchema>;

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

export const lookupVideos = defineRoute({
  method: 'POST',
  path: '/videos/lookup',
  schema: {
    body: lookupVideosBodySchema,
    response: {
      200: apiSuccess(videoLookupSchema),
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

export const listTrashedVideos = defineRoute({
  method: 'GET',
  path: '/videos/trash',
  schema: {
    response: {
      200: apiSuccess(trashListSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const restoreVideo = defineRoute({
  method: 'POST',
  path: '/videos/{id}/restore',
  schema: {
    params: videoIdParamsSchema,
    response: {
      200: apiSuccess(videoSchema),
      404: apiErrorSchema,
      // NOT_RESTORABLE — 보관 기간이 끝났거나 파일을 남기지 않고 지운 영상이다.
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
