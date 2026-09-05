import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';
import { snsPlatformSchema, snsUploadStatusSchema } from './vocab.js';

export const snsConnectionSchema = z
  .object({
    platform: snsPlatformSchema,
    platformUsername: z.string().nullable(),
    connectedAt: z.iso.datetime(),
  })
  .meta({ id: 'SnsConnection' });
export type SnsConnection = z.infer<typeof snsConnectionSchema>;

export const authorizeUrlSchema = z.object({ authorizeUrl: z.string() });
export const disconnectedSchema = z.object({ disconnected: z.literal(true) });

export const snsUploadSchema = z.object({
  uploadId: z.uuid(),
  platform: snsPlatformSchema,
  status: snsUploadStatusSchema.describe(
    '`success` 는 게시 완료. `pending` 은 플랫폼이 아직 처리 중(실패가 아님 — 앱은 "업로드 중" 으로 표시).',
  ),
  platformPostId: z.string().nullable(),
  requiresUserAction: z
    .boolean()
    .optional()
    .describe(
      'true 면 업로드는 끝났지만 **사용자가 플랫폼 앱에서 마무리해야** 게시된다(틱톡 받은함 모드). 앱은 "틱톡 앱에서 마무리하세요" 를 안내한다.',
    ),
});
export type SnsUpload = z.infer<typeof snsUploadSchema>;

export const snsUploadBodySchema = z.object({
  videoId: z.uuid(),
  caption: z.string().max(2200).optional(),
});
export type SnsUploadBody = z.infer<typeof snsUploadBodySchema>;

export const snsPlatformParamsSchema = z.object({ platform: snsPlatformSchema });

/** OAuth 제공자가 브라우저를 되돌려 보낼 때 붙이는 값. 모르는 파라미터는 무시한다. */
export const snsOauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const listSnsConnections = defineRoute({
  method: 'GET',
  path: '/sns/connections',
  schema: {
    response: {
      200: apiSuccess(z.array(snsConnectionSchema)),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getSnsConnectUrl = defineRoute({
  method: 'GET',
  path: '/sns/{platform}/connect',
  schema: {
    params: snsPlatformParamsSchema,
    response: {
      200: apiSuccess(authorizeUrlSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

/**
 * OAuth 콜백. 302 로 앱 딥링크에 되돌려 보내므로 JSON 응답 계약이 없다 — Location 값은 외부
 * OAuth 결과에 따라 달라진다.
 */
export const snsOauthCallback = defineRoute({
  method: 'GET',
  path: '/sns/{platform}/callback',
  schema: {
    params: snsPlatformParamsSchema,
    querystring: snsOauthCallbackQuerySchema,
  },
});

export const disconnectSns = defineRoute({
  method: 'DELETE',
  path: '/sns/{platform}/disconnect',
  schema: {
    params: snsPlatformParamsSchema,
    response: {
      200: apiSuccess(disconnectedSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const uploadToSns = defineRoute({
  method: 'POST',
  path: '/sns/{platform}/upload',
  schema: {
    params: snsPlatformParamsSchema,
    body: snsUploadBodySchema,
    response: {
      200: apiSuccess(snsUploadSchema),
      400: apiErrorSchema,
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
