import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';

export const userProfileSchema = z
  .object({
    id: z.uuid(),
    nickname: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    interests: z.array(z.string()),
    notificationEnabled: z.boolean(),
    quietStart: z.int().min(0).max(23),
    quietEnd: z.int().min(0).max(23),
  })
  .meta({ id: 'UserProfile' });
export type UserProfile = z.infer<typeof userProfileSchema>;

export const patchMeBodySchema = z.object({
  nickname: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
  interests: z.array(z.string().max(30)).max(20).optional(),
});
export type PatchMeBody = z.infer<typeof patchMeBodySchema>;

export const fcmTokenBodySchema = z.object({
  fcmToken: z.string().min(1).max(4096),
});
export type FcmTokenBody = z.infer<typeof fcmTokenBodySchema>;

export const accountDeletedSchema = z.object({
  deleted: z.literal(true),
  purgeAfter: z.iso.datetime().describe('이 시각 이후 배치가 실삭제한다 — 그 전에는 복구 가능'),
});
export type AccountDeleted = z.infer<typeof accountDeletedSchema>;

export const accountRestoredSchema = z.object({ restored: z.literal(true) });
export const updatedSchema = z.object({ updated: z.literal(true) });

export const getMe = defineRoute({
  method: 'GET',
  path: '/auth/me',
  schema: {
    response: {
      200: apiSuccess(userProfileSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const patchMe = defineRoute({
  method: 'PATCH',
  path: '/auth/me',
  schema: {
    body: patchMeBodySchema,
    response: {
      200: apiSuccess(userProfileSchema),
      400: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const deleteMe = defineRoute({
  method: 'DELETE',
  path: '/auth/me',
  schema: {
    response: {
      200: apiSuccess(accountDeletedSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const restoreMe = defineRoute({
  method: 'POST',
  path: '/auth/me/restore',
  schema: {
    response: {
      200: apiSuccess(accountRestoredSchema),
      400: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const registerFcmToken = defineRoute({
  method: 'POST',
  path: '/auth/fcm-token',
  schema: {
    body: fcmTokenBodySchema,
    response: {
      200: apiSuccess(updatedSchema),
      400: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
