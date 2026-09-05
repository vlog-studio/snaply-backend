import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  disconnectSns,
  getSnsConnectUrl,
  listSnsConnections,
  snsOauthCallback,
  uploadToSns,
  ok,
} from '@vlog-studio/shared-types';
import {
  buildConnectUrl,
  handleCallback,
  listConnections,
  disconnect,
  upload,
  snsErrorDeepLink,
} from '../services/sns.service.js';

export async function snsRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // GET /sns/connections — 연동된 계정 목록
  routes.get(
    listSnsConnections.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: { ...listSnsConnections.schema, tags: ['sns'], summary: '연동 계정 목록' },
    },
    async (request) => {
      return ok(await listConnections(request.user.id));
    },
  );

  // GET /sns/:platform/connect — OAuth URL 반환
  routes.get(
    getSnsConnectUrl.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: { ...getSnsConnectUrl.schema, tags: ['sns'], summary: 'SNS OAuth URL' },
    },
    async (request) => {
      const { platform } = request.params;
      return ok({ authorizeUrl: buildConnectUrl(platform, request.user.id) });
    },
  );

  // GET /sns/:platform/callback — OAuth 콜백 (인증 없음) → 앱 딥링크 리다이렉트
  routes.get(
    snsOauthCallback.fastifyPath,
    // reply.redirect가 302와 빈 본문을 반환하므로 연결할 JSON DTO가 없다.
    // Location 값은 외부 OAuth 결과에 따라 달라져 응답 스키마는 의도적으로 생략한다.
    { schema: { ...snsOauthCallback.schema, tags: ['sns'], summary: 'SNS OAuth 콜백' } },
    async (request, reply) => {
      const { platform } = request.params;
      const { code, state, error } = request.query;
      if (error || !code || !state) {
        return reply.redirect(snsErrorDeepLink(platform, error ?? 'missing_params'));
      }
      // 콜백은 사용자의 브라우저가 도착하는 지점이다. 여기서 JSON 에러를 반환하면
      // 사용자가 앱으로 돌아갈 방법이 없어 OAuth 도중에 갇힌다. 무슨 일이 있어도 딥링크로 보낸다.
      let target: string;
      try {
        target = await handleCallback({ platform, code, state, logger: request.log });
      } catch (err) {
        request.log.error({ err, platform }, 'SNS 콜백 처리 실패');
        target = snsErrorDeepLink(platform, 'exchange_failed');
      }
      return reply.redirect(target);
    },
  );

  // DELETE /sns/:platform/disconnect — 연동 해제
  routes.delete(
    disconnectSns.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: { ...disconnectSns.schema, tags: ['sns'], summary: 'SNS 연동 해제' },
    },
    async (request) => {
      await disconnect(request.user.id, request.params.platform);
      return ok({ disconnected: true });
    },
  );

  // POST /sns/:platform/upload — 업로드
  routes.post(
    uploadToSns.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: { ...uploadToSns.schema, tags: ['sns'], summary: 'SNS 업로드' },
    },
    async (request) => {
      const data = await upload({
        userId: request.user.id,
        platform: request.params.platform,
        videoId: request.body.videoId,
        caption: request.body.caption ?? '',
      });
      return ok(data);
    },
  );
}
