import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, MovieTemplateCatalog } from '@vlog-studio/shared-types';
import { listMovieTemplates } from '../services/movie-template.service.js';
import {
  AUTHENTICATED_ERROR_RESPONSES,
  MOVIE_TEMPLATE_CATALOG_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';

export async function movieTemplateRoutes(app: FastifyInstance): Promise<void> {
  // GET /movie-templates — 카탈로그 조회
  app.get(
    '/movie-templates',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['movie-templates'],
        summary: '무비 템플릿 카탈로그 조회',
        description: [
          '사용자가 "템플릿으로 시작"할 때 고를 수 있는 무비의 형태들을 정렬 순서대로 준다.',
          '내린 템플릿(`retiredAt`)은 제외된다.',
          '',
          '**앱은 이 응답을 캐시하고, 실패하면 내장 카탈로그로 폴백한다.** 그래서 이 API 가 죽어도',
          '템플릿 화면은 동작한다. 캐시 갱신 판단은 `updatedAt` 으로 한다.',
          '',
          '`style` 은 `POST /edit-jobs` 가 받는 프리셋 이름 그대로다. 서버가 새 프리셋을 추가했는데',
          '앱이 아직 모를 수 있으므로 **모르는 프리셋의 템플릿은 앱이 건너뛴다** — 서버는 거르지 않는다.',
          '',
          '슬롯의 `label`·`hint` 는 **사람에게 보여주는 촬영 지시**이지, 그 자리에 들어간 스냅의',
          '내용에 대한 주장이 아니다. 점수화가 쓰는 매칭 힌트는 이 응답에 포함되지 않는다.',
        ].join('\n'),
        response: {
          200: successResponseSchema(MOVIE_TEMPLATE_CATALOG_SCHEMA),
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (): Promise<ApiSuccess<MovieTemplateCatalog>> => {
      const data = await listMovieTemplates();
      return { success: true, data };
    },
  );
}
