import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

/**
 * OpenAPI 문서 + Swagger UI 등록. 라우트 등록 *전*에 호출해야 스키마가 수집된다.
 * 개발 환경에서만 노출(운영에서는 비활성).
 */
export async function registerDocs(app: FastifyInstance): Promise<void> {
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
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'auth', description: '인증/프로필' },
        { name: 'videos', description: '영상 업로드' },
        { name: 'edit-jobs', description: 'AI 편집' },
        { name: 'locations', description: '위치 알림' },
        { name: 'sns', description: 'SNS 연동' },
        { name: 'billing', description: '결제' },
        { name: 'system', description: '헬스체크/웹훅' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
}
