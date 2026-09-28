import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  deleteMe,
  getAnalysisConsent,
  getMe,
  grantAnalysisConsent,
  patchMe,
  registerFcmToken,
  restoreMe,
  revokeAnalysisConsent,
  ok,
} from '@vlog-studio/shared-types';
import { AppError } from '../lib/errors.js';
import { getProfile, updateProfile, updateFcmToken } from '../services/user.service.js';
import { deleteAccount, restoreAccount } from '../services/account.service.js';
import {
  giveAnalysisConsent,
  readAnalysisConsent,
  withdrawAnalysisConsent,
} from '../services/analysis-consent.service.js';

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

  // 스냅 분석 동의 — 옵트인. 분석은 동의한 사용자의 스냅에만 돈다 (specs ANA-5)
  routes.get(
    getAnalysisConsent.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getAnalysisConsent.schema,
        tags: ['auth'],
        summary: '스냅 분석 동의 상태',
        description: [
          '분석을 쓰는 기능(템플릿 추천 등)을 처음 쓸 때 앱이 물을지 정하는 데 쓴다.',
          '',
          '- `available: false` — 서버가 분석을 꺼 두었다. 동의해도 돌지 않으므로 묻지 않는다',
          '- `granted` — **현재 문구 버전**에 동의했고 철회하지 않았다. 문구가 바뀌면(`currentVersion`) 이전',
          '  동의는 `granted: false` 가 되고 앱이 다시 묻는다',
        ].join('\n'),
      },
    },
    async (request) => ok(await readAnalysisConsent(request.user.id)),
  );

  routes.post(
    grantAnalysisConsent.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...grantAnalysisConsent.schema,
        tags: ['auth'],
        summary: '스냅 분석 동의',
        description: [
          '사용자가 본 동의 문구의 `version` 을 보낸다. **멱등하다** — 이미 동의했으면 기록을 늘리지 않는다.',
          '',
          '`version` 이 `currentVersion` 과 다르면 **409** `CONSENT_VERSION_MISMATCH` — 앱이 낡은 문구를 보여',
          '준 것이다. 상태를 다시 읽어 바뀐 문구로 다시 물어야 한다.',
        ].join('\n'),
      },
    },
    async (request) => ok(await giveAnalysisConsent(request.user.id, request.body.version)),
  );

  routes.delete(
    revokeAnalysisConsent.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...revokeAnalysisConsent.schema,
        tags: ['auth'],
        summary: '스냅 분석 동의 철회',
        description: [
          '그 뒤로 분석하지 않고, 이 사용자의 **분석 결과와 추천 기록을 파기**한다. 동의 기록 자체는 철회',
          '시각과 함께 남는다. 동의가 없어도 성공한다(멱등).',
        ].join('\n'),
      },
    },
    async (request) => ok(await withdrawAnalysisConsent(request.user.id)),
  );
}
