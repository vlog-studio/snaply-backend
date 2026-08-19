import type { FastifyInstance, FastifyReply } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

interface DocsConfig {
  supabaseUrl: string;
  supabasePublishableKey: string | undefined;
  allowDevLogin: boolean;
}

interface PasswordGrantBody {
  grant_type?: string;
  username?: string;
  password?: string;
}

interface SupabaseTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  error?: unknown;
  error_description?: unknown;
  msg?: unknown;
  message?: unknown;
}

const FORM_URLENCODED = 'application/x-www-form-urlencoded';

function oauthError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  description: string,
): FastifyReply {
  return reply.status(statusCode).send({ error, error_description: description });
}

function errorDescription(payload: SupabaseTokenResponse): string {
  for (const value of [
    payload.error_description,
    payload.msg,
    payload.message,
    payload.error,
  ]) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return '이메일 또는 비밀번호를 확인하세요.';
}

/** Swagger OAuth2 password flow를 Supabase 이메일 로그인으로 변환한다. */
function registerDevLogin(app: FastifyInstance, config: DocsConfig): void {
  if (!app.hasContentTypeParser(FORM_URLENCODED)) {
    app.addContentTypeParser(
      FORM_URLENCODED,
      { parseAs: 'string' },
      (_request, body, done) => {
        const rawBody = typeof body === 'string' ? body : body.toString('utf8');
        done(null, Object.fromEntries(new URLSearchParams(rawBody)));
      },
    );
  }

  app.post<{ Body: PasswordGrantBody }>(
    '/docs/auth/token',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { hide: true },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store').header('pragma', 'no-cache');
      const { grant_type: grantType, username: email, password } = request.body;
      if (grantType !== 'password') {
        return oauthError(reply, 400, 'unsupported_grant_type', 'password grant만 지원합니다.');
      }
      if (!email || !password) {
        return oauthError(reply, 400, 'invalid_request', '이메일과 비밀번호가 필요합니다.');
      }

      let response: Response;
      try {
        response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: config.supabasePublishableKey!,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });
      } catch (error) {
        request.log.error(error, 'Supabase 개발 로그인 요청 실패');
        return oauthError(
          reply,
          502,
          'temporarily_unavailable',
          'Supabase Auth에 연결할 수 없습니다.',
        );
      }

      let payload: SupabaseTokenResponse;
      try {
        payload = (await response.json()) as SupabaseTokenResponse;
      } catch {
        return oauthError(
          reply,
          502,
          'server_error',
          'Supabase Auth가 올바르지 않은 응답을 반환했습니다.',
        );
      }

      if (!response.ok) {
        const statusCode = response.status === 429 ? 429 : 400;
        return oauthError(reply, statusCode, 'invalid_grant', errorDescription(payload));
      }
      if (typeof payload.access_token !== 'string') {
        return oauthError(
          reply,
          502,
          'server_error',
          'Supabase Auth 응답에 access_token이 없습니다.',
        );
      }

      return reply.send({
        access_token: payload.access_token,
        token_type: typeof payload.token_type === 'string' ? payload.token_type : 'bearer',
        expires_in: typeof payload.expires_in === 'number' ? payload.expires_in : 3600,
        ...(typeof payload.refresh_token === 'string'
          ? { refresh_token: payload.refresh_token }
          : {}),
      });
    },
  );
}

/**
 * OpenAPI 문서 + Swagger UI 등록. 라우트 등록 *전*에 호출해야 스키마가 수집된다.
 * 개발 환경에서만 노출(운영에서는 비활성).
 */
export async function registerDocs(app: FastifyInstance, config: DocsConfig): Promise<void> {
  const devLoginEnabled = config.allowDevLogin && Boolean(config.supabasePublishableKey);

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Snaply API',
        description:
          '숏폼 브이로그 AI 편집 앱 백엔드 API. WebSocket(/edit-jobs/:id/progress)은 OpenAPI로 표현되지 않으니 docs/api-spec.md 참고.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: devLoginEnabled
          ? {
              bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
              devLogin: {
                type: 'oauth2',
                description: '개발용: Username에 Supabase 테스트 이메일을 입력하세요.',
                flows: {
                  password: {
                    tokenUrl: '/docs/auth/token',
                    scopes: {},
                  },
                },
              },
            }
          : {
              bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
      },
      security: [
        { bearerAuth: [] },
        ...(devLoginEnabled ? [{ devLogin: [] }] : []),
      ],
      tags: [
        { name: 'auth', description: '인증/프로필' },
        {
          name: 'videos',
          description:
            '영상 업로드. 업로드는 2단계다 — ① `GET /videos/upload-url`로 presigned URL 발급 → ② 그 URL에 파일 직접 PUT(S3, Swagger 밖) → ③ `POST /videos`로 등록해 `ready` 전이.',
        },
        {
          name: 'edit-jobs',
          description:
            'AI 편집. `ready` 영상들로 `POST /edit-jobs` → 202 `jobId` → `GET /edit-jobs/{id}` 폴링(또는 WS)으로 진행률 → 완료 시 결과물 영상의 `editedUrl`. **AI 워커(`npm run worker`)가 떠 있어야 처리된다.**',
        },
        {
          name: 'movie-templates',
          description:
            '무비 템플릿 카탈로그. "템플릿으로 시작"이 고르는 무비의 형태이며, 앱은 응답을 캐시하고 실패하면 내장 카탈로그로 폴백한다.',
        },
        { name: 'locations', description: '위치 알림' },
        { name: 'sns', description: 'SNS 연동' },
        { name: 'billing', description: '결제' },
        { name: 'system', description: '헬스체크/웹훅' },
      ],
    },
  });

  if (devLoginEnabled) {
    registerDevLogin(app, config);
  }

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
}
