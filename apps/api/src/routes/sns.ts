import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, SnsPlatform } from '@vlog-studio/shared-types';
import {
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  AUTHORIZE_URL_SCHEMA,
  DISCONNECTED_DATA_SCHEMA,
  SNS_CONNECTION_SCHEMA,
  SNS_UPLOAD_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
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
  response: {
    200: successResponseSchema(SNS_UPLOAD_SCHEMA),
    400: API_ERROR_SCHEMA,
    404: API_ERROR_SCHEMA,
    ...AUTHENTICATED_ERROR_RESPONSES,
  },
} as const;

export async function snsRoutes(app: FastifyInstance): Promise<void> {
  // GET /sns/connections — 연동된 계정 목록
  app.get(
    '/sns/connections',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['sns'],
        summary: '연동 계정 목록',
        response: {
          200: successResponseSchema({ type: 'array', items: SNS_CONNECTION_SCHEMA }),
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<ConnectionDto[]>> => {
      return { success: true, data: await listConnections(request.user.id) };
    },
  );

  for (const platform of ['instagram', 'tiktok'] as SnsPlatform[]) {
    // GET /sns/{platform}/connect — OAuth URL 반환
    app.get(
      `/sns/${platform}/connect`,
      {
        preHandler: app.authenticate,
        schema: {
          tags: ['sns'],
          summary: `${platform} OAuth URL`,
          response: {
            200: successResponseSchema(AUTHORIZE_URL_SCHEMA),
            ...AUTHENTICATED_ERROR_RESPONSES,
          },
        },
      },
      async (request): Promise<ApiSuccess<{ authorizeUrl: string }>> => {
        return { success: true, data: { authorizeUrl: buildConnectUrl(platform, request.user.id) } };
      },
    );

    // GET /sns/{platform}/callback — OAuth 콜백 (인증 없음) → 앱 딥링크 리다이렉트
    app.get<{ Querystring: CallbackQuery }>(
      `/sns/${platform}/callback`,
      // reply.redirect가 302와 빈 본문을 반환하므로 연결할 JSON DTO가 없다.
      // Location 값은 외부 OAuth 결과에 따라 달라져 응답 스키마는 의도적으로 생략한다.
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
      {
        preHandler: app.authenticate,
        schema: {
          tags: ['sns'],
          summary: `${platform} 연동 해제`,
          response: {
            200: successResponseSchema(DISCONNECTED_DATA_SCHEMA),
            404: API_ERROR_SCHEMA,
            ...AUTHENTICATED_ERROR_RESPONSES,
          },
        },
      },
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
