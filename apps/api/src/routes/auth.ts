import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { deleteMe, getMe, patchMe, registerFcmToken, restoreMe, ok } from '@vlog-studio/shared-types';
import { AppError } from '../lib/errors.js';
import { getProfile, updateProfile, updateFcmToken } from '../services/user.service.js';
import { deleteAccount, restoreAccount } from '../services/account.service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // GET /auth/me — 내 프로필 조회 (미들웨어에서 첫 로그인 시 자동 생성됨)
  routes.get(
    getMe.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: { ...getMe.schema, tags: ['auth'], summary: '내 프로필 조회' },
    },
    async (request) => {
      const profile = await getProfile(request.user.id);
      if (!profile) {
        throw AppError.notFound('유저를 찾을 수 없습니다.');
      }
      return ok(profile);
    },
  );

  // PATCH /auth/me — 프로필 수정
  routes.patch(
    patchMe.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: { ...patchMe.schema, tags: ['auth'], summary: '프로필 수정' },
    },
    async (request) => {
      const profile = await updateProfile(request.user.id, request.body);
      return ok(profile);
    },
  );

  // DELETE /auth/me — 계정 삭제 요청 (소프트 삭제, 30일 유예 후 실삭제)
  routes.delete(
    deleteMe.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...deleteMe.schema,
        tags: ['auth'],
        summary: '계정 삭제 (30일 유예 후 영구 삭제)',
        description:
          'SNS 연동·FCM 토큰 삭제, 진행 중 편집 작업 취소·예약 크레딧 환급 후 계정을 삭제 대기 ' +
          '상태로 전환한다. purgeAfter 이전에는 POST /auth/me/restore 로 복구할 수 있다.',
      },
    },
    async (request) => {
      const { purgeAfter } = await deleteAccount(request.user.id);
      return ok({ deleted: true, purgeAfter: purgeAfter.toISOString() });
    },
  );

  // POST /auth/me/restore — 유예 기간 내 계정 복구 (삭제 대기 계정도 인증 통과 필요)
  routes.post(
    restoreMe.fastifyPath,
    {
      preHandler: app.authenticateAllowDeleted,
      schema: { ...restoreMe.schema, tags: ['auth'], summary: '삭제 대기 계정 복구' },
    },
    async (request) => {
      await restoreAccount(request.user.id);
      return ok({ restored: true });
    },
  );

  // POST /auth/fcm-token — FCM 토큰 등록/갱신 (기기 교체 대비 항상 덮어쓰기)
  routes.post(
    registerFcmToken.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: { ...registerFcmToken.schema, tags: ['auth'], summary: 'FCM 토큰 등록/갱신' },
    },
    async (request) => {
      await updateFcmToken(request.user.id, request.body.fcmToken);
      return ok({ updated: true });
    },
  );
}
