import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, UserProfile } from '@vlog-studio/shared-types';
import { AppError } from '../lib/errors.js';
import {
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  UPDATED_DATA_SCHEMA,
  USER_PROFILE_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
import { getProfile, updateProfile, updateFcmToken } from '../services/user.service.js';

interface PatchMeBody {
  nickname?: string;
  avatarUrl?: string | null;
  interests?: string[];
}

interface FcmTokenBody {
  fcmToken: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // GET /auth/me — 내 프로필 조회 (미들웨어에서 첫 로그인 시 자동 생성됨)
  app.get(
    '/auth/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: '내 프로필 조회',
        response: {
          200: successResponseSchema(USER_PROFILE_SCHEMA),
          404: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<UserProfile>> => {
      const profile = await getProfile(request.user.id);
      if (!profile) {
        throw AppError.notFound('유저를 찾을 수 없습니다.');
      }
      return { success: true, data: profile };
    },
  );

  // PATCH /auth/me — 프로필 수정
  app.patch<{ Body: PatchMeBody }>(
    '/auth/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: '프로필 수정',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            nickname: { type: 'string', minLength: 1, maxLength: 50 },
            avatarUrl: { type: ['string', 'null'], maxLength: 2048 },
            interests: {
              type: 'array',
              items: { type: 'string', maxLength: 30 },
              maxItems: 20,
            },
          },
        },
        response: {
          200: successResponseSchema(USER_PROFILE_SCHEMA),
          400: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<UserProfile>> => {
      const profile = await updateProfile(request.user.id, request.body);
      return { success: true, data: profile };
    },
  );

  // POST /auth/fcm-token — FCM 토큰 등록/갱신 (기기 교체 대비 항상 덮어쓰기)
  app.post<{ Body: FcmTokenBody }>(
    '/auth/fcm-token',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: 'FCM 토큰 등록/갱신',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['fcmToken'],
          properties: {
            fcmToken: { type: 'string', minLength: 1, maxLength: 4096 },
          },
        },
        response: {
          200: successResponseSchema(UPDATED_DATA_SCHEMA),
          400: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ updated: true }>> => {
      await updateFcmToken(request.user.id, request.body.fcmToken);
      return { success: true, data: { updated: true } };
    },
  );
}
