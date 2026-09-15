import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';

export const userProfileSchema = z
  .object({
    id: z.uuid(),
    nickname: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    interests: z.array(z.string()),
    notificationEnabled: z.boolean().describe('푸시 전체 스위치. 끄면 종류와 무관하게 오지 않는다.'),
    locationNotificationEnabled: z.boolean().describe('위치 도착 알림을 받을지.'),
    movieNotificationEnabled: z.boolean().describe('무비 완성 알림을 받을지.'),
    quietStart: z.int().min(0).max(23).describe('방해 금지 시작 시각(KST, 0-23).'),
    quietEnd: z.int().min(0).max(23).describe('방해 금지 종료 시각(KST, 0-23). 시작과 같으면 없음.'),
  })
  .meta({ id: 'UserProfile' });
export type UserProfile = z.infer<typeof userProfileSchema>;

export const patchMeBodySchema = z.object({
  nickname: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
  interests: z.array(z.string().max(30)).max(20).optional(),
  notificationEnabled: z
    .boolean()
    .optional()
    .describe('푸시 전체 스위치. 끄면 종류별 스위치와 무관하게 아무것도 가지 않는다.'),
  locationNotificationEnabled: z.boolean().optional().describe('위치 도착 알림을 받을지.'),
  movieNotificationEnabled: z.boolean().optional().describe('무비 완성 알림을 받을지.'),
  quietStart: z.int().min(0).max(23).optional().describe('방해 금지 시작 시각(KST, 0-23).'),
  quietEnd: z
    .int()
    .min(0)
    .max(23)
    .optional()
    .describe('방해 금지 종료 시각(KST, 0-23). 시작과 같게 두면 방해 금지가 없다.'),
});

/**
 * **스냅 만료 예고에는 종류별 스위치가 없다.** 끌 수 있게 하면 사용자가 모르는 채로 영상을
 * 잃는다 — 만료에 유예가 없는 근거가 "미리 알린다" 였다. 전체 스위치를 끈 경우에만 가지
 * 않으며, 그때는 화면의 남은 기간 표시가 유일한 안내다
 * (docs/decisions/notification-preferences.md).
 */
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
