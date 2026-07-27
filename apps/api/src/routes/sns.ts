import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, SnsPlatform } from '@vlog-studio/shared-types';
import {
  buildConnectUrl,
  handleCallback,
  listConnections,
  disconnect,
  upload,
  snsErrorDeepLink,
  type ConnectionDto,
  type UploadDto,
} from '../services/sns.service.js';

interface UploadBody {
  videoId: string;
  caption?: string;
}

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

const uploadSchema = {
  tags: ['sns'],
  summary: 'SNS 업로드',
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['videoId'],
    properties: {
      videoId: { type: 'string', format: 'uuid' },
      caption: { type: 'string', maxLength: 2200 },
    },
  },
} as const;

export async function snsRoutes(app: FastifyInstance): Promise<void> {
  // GET /sns/connections — 연동된 계정 목록
  app.get(
    '/sns/connections',
    { preHandler: app.authenticate, schema: { tags: ['sns'], summary: '연동 계정 목록' } },
    async (request): Promise<ApiSuccess<ConnectionDto[]>> => {
      return { success: true, data: await listConnections(request.user.id) };
    },
  );

  for (const platform of ['instagram', 'tiktok'] as SnsPlatform[]) {
    // GET /sns/{platform}/connect — OAuth URL 반환
    app.get(
      `/sns/${platform}/connect`,
      { preHandler: app.authenticate, schema: { tags: ['sns'], summary: `${platform} OAuth URL` } },
      async (request): Promise<ApiSuccess<{ authorizeUrl: string }>> => {
        return { success: true, data: { authorizeUrl: buildConnectUrl(platform, request.user.id) } };
      },
    );

    // GET /sns/{platform}/callback — OAuth 콜백 (인증 없음) → 앱 딥링크 리다이렉트
    app.get<{ Querystring: CallbackQuery }>(
      `/sns/${platform}/callback`,
      { schema: { tags: ['sns'], summary: `${platform} OAuth 콜백` } },
      async (request, reply) => {
        const { code, state, error } = request.query;
        if (error || !code || !state) {
          return reply.redirect(snsErrorDeepLink(platform, error ?? 'missing_params'));
        }
        const target = await handleCallback({ platform, code, state });
        return reply.redirect(target);
      },
    );

    // DELETE /sns/{platform}/disconnect — 연동 해제
    app.delete(
      `/sns/${platform}/disconnect`,
      { preHandler: app.authenticate, schema: { tags: ['sns'], summary: `${platform} 연동 해제` } },
      async (request): Promise<ApiSuccess<{ disconnected: true }>> => {
        await disconnect(request.user.id, platform);
        return { success: true, data: { disconnected: true } };
      },
    );

    // POST /sns/{platform}/upload — 업로드
    app.post<{ Body: UploadBody }>(
      `/sns/${platform}/upload`,
      { preHandler: app.authenticate, schema: uploadSchema },
      async (request): Promise<ApiSuccess<UploadDto>> => {
        const data = await upload({
          userId: request.user.id,
          platform,
          videoId: request.body.videoId,
          caption: request.body.caption ?? '',
        });
        return { success: true, data };
      },
    );
  }
}
