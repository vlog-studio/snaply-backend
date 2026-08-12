import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, UserProfile } from '@vlog-studio/shared-types';
import { AppError } from '../lib/errors.js';
import {
  ACCOUNT_DELETED_SCHEMA,
  ACCOUNT_RESTORED_SCHEMA,
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  UPDATED_DATA_SCHEMA,
  USER_PROFILE_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
import { getProfile, updateProfile, updateFcmToken } from '../services/user.service.js';
import { deleteAccount, restoreAccount } from '../services/account.service.js';

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

  // DELETE /auth/me — 계정 삭제 요청 (소프트 삭제, 30일 유예 후 실삭제)
  app.delete(
    '/auth/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: '계정 삭제 (30일 유예 후 영구 삭제)',
        description:
          '구독 즉시 해지, SNS 연동·FCM 토큰 삭제, 진행 중 편집 작업 취소 후 계정을 삭제 대기 ' +
          '상태로 전환한다. purgeAfter 이전에는 POST /auth/me/restore 로 복구할 수 있다.',
        response: {
          200: successResponseSchema(ACCOUNT_DELETED_SCHEMA),
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ deleted: true; purgeAfter: string }>> => {
      const { purgeAfter } = await deleteAccount(request.user.id);
      return { success: true, data: { deleted: true, purgeAfter: purgeAfter.toISOString() } };
    },
  );

  // POST /auth/me/restore — 유예 기간 내 계정 복구 (삭제 대기 계정도 인증 통과 필요)
  app.post(
    '/auth/me/restore',
    {
      preHandler: app.authenticateAllowDeleted,
      schema: {
        tags: ['auth'],
        summary: '삭제 대기 계정 복구',
        response: {
          200: successResponseSchema(ACCOUNT_RESTORED_SCHEMA),
          400: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ restored: true }>> => {
      await restoreAccount(request.user.id);
      return { success: true, data: { restored: true } };
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
