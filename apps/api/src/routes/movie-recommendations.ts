import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, MovieRecommendation } from '@vlog-studio/shared-types';
import {
  getRecommendation,
  requestRecommendation,
} from '../services/movie-recommendation.service.js';
import { MAX_CANDIDATES } from '../services/recommendation/recommendation-policy.js';
import {
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  CANDIDATE_LIMIT_ERROR_SCHEMA,
  MOVIE_RECOMMENDATION_SCHEMA,
  RECOMMENDATION_ACCEPTED_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';

interface RecommendationBody {
  templateId: string;
  candidates: string[];
}

const RECOMMENDATION_BODY_SCHEMA = {
  type: 'object',
  required: ['templateId', 'candidates'],
  additionalProperties: false,
  properties: {
    templateId: { type: 'string', minLength: 1, description: 'GET /movie-templates 의 템플릿 id' },
    // 개수 상한은 여기서 걸지 않는다. 스키마가 먼저 자르면 클라이언트는 몇 개까지 되는지
    // 알 수 없는 일반 검증 오류를 받는다 — 서비스가 `TOO_MANY_CANDIDATES` + `max` 로 답한다.
    candidates: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      description: `후보 스냅의 videoId, **촬영 시간 오름차순**. 이 순서가 점수화의 시간 사전값이다. 최대 ${MAX_CANDIDATES}개`,
    },
  },
} as const;

export async function movieRecommendationRoutes(app: FastifyInstance): Promise<void> {
  // POST /movie-recommendations — 추천 접수 (멱등)
  app.post<{ Body: RecommendationBody }>(
    '/movie-recommendations',
    {
      preHandler: app.authenticate,
      config: {
        // 유저(토큰)당 분당 10회. 비용 방어는 일일 한도가 하고, 이건 버스트만 막는다.
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.headers.authorization ?? req.ip,
        },
      },
      schema: {
        tags: ['movie-templates'],
        summary: '템플릿 슬롯에 넣을 스냅 추천 요청 (비동기)',
        description: [
          '템플릿의 각 슬롯에 어떤 스냅을 넣을지 서버가 제안한다. **비동기** — 즉시 `202` 와',
          '`id` 만 돌려주고, 결과는 `GET /movie-recommendations/{id}` 로 폴링한다.',
          '',
          '**후보는 앱이 고른다.** 서버는 스냅이 언제 어디서 찍혔는지 모르므로(업로드 시',
          '촬영 시각·좌표를 받지 않는다) 한 번의 외출을 묶는 계산은 앱만 할 수 있다.',
          '`candidates` 는 **촬영 시간 오름차순**이어야 한다 — 이 순서가 점수화의 시간 사전값이다.',
          '',
          '**앱은 이 결과를 기다리지 않는다.** 로컬 매칭이 먼저 화면을 채우고, 도착한 결과는',
          '사용자가 손대지 않은 슬롯에만 얹힌다. 그래서 이 API 가 느리거나 죽어도 화면은 동작한다.',
          '',
          '**멱등하다.** 같은 (유저·템플릿·후보 집합) 이 24시간 안에 다시 오면 새 추천을 만들지',
          '않고 기존 것을 돌려준다. 화면을 다시 열 때마다 재분석하면 그게 그대로 비용이다.',
          '',
          '**크레딧을 차감하지 않는다.** 추천은 채택할지 버릴지 모르는 제안이고, 제안에 과금하면',
          '"만들기도 전에 돈부터 낸다"가 된다. 비용은 후보 수와 일일 횟수 상한으로 막는다.',
          '',
          `후보는 한 번에 **${MAX_CANDIDATES}개**까지다. 초과분은 앱이 균등 샘플링해서 보낸다.`,
        ].join('\n'),
        body: RECOMMENDATION_BODY_SCHEMA,
        response: {
          202: successResponseSchema(RECOMMENDATION_ACCEPTED_SCHEMA),
          400: CANDIDATE_LIMIT_ERROR_SCHEMA,
          404: API_ERROR_SCHEMA,
          503: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply): Promise<ApiSuccess<{ id: string; status: string }>> => {
      const { recommendation } = await requestRecommendation({
        userId: request.user.id,
        templateId: request.body.templateId,
        candidateVideoIds: request.body.candidates,
      });
      reply.status(202);
      return { success: true, data: { id: recommendation.id, status: recommendation.status } };
    },
  );

  // GET /movie-recommendations/:id — 상태·결과 조회
  app.get<{ Params: { id: string } }>(
    '/movie-recommendations/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['movie-templates'],
        summary: '스냅 추천 상태·결과 조회',
        description: [
          '`status` 의 의미:',
          '- `processing` — 후보 분석이 아직 끝나지 않았다. `slots` 는 비어 있다',
          '- `done` — `slots` 가 템플릿의 슬롯 순서대로 채워진다',
          '',
          '**채점은 이 조회 시점에 일어난다.** 분석이 다 끝났으면 배정하고 굳히며, 아직이면',
          '`processing` 을 돌려준다. 접수 후 일정 시간이 지나면 끝난 분석만으로 채점하고 닫는다 —',
          '분석 워커가 죽었을 때 추천이 영원히 걸려 있으면 안 된다.',
          '',
          '`slots[].videoId` 가 `null` 이면 그 자리에 넣을 후보가 없었다는 뜻이다. 못 쓸 스냅으로',
          '채우는 것보다 빈 슬롯이 정직하다 — 화면에서는 `지금 찍기` 로 남는다.',
          '',
          '`slots[].score` 는 **슬롯 적합도**이지 스냅 내용에 대한 주장이 아니다. 슬롯 이름은',
          '사람에게 주는 촬영 지시이고, 서버는 "이 스냅이 골목이다"라고 말하지 않는다.',
          '',
          '`excluded[].reason`: `unusable`(편집에 쓸 수 없다고 분석이 판단) ·',
          '`analysis_failed`(분석 실패 또는 시한 초과) · `no_match`(슬롯보다 후보가 많아 자리 없음).',
        ].join('\n'),
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: successResponseSchema(MOVIE_RECOMMENDATION_SCHEMA),
          404: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<MovieRecommendation>> => {
      const data = await getRecommendation({
        userId: request.user.id,
        recommendationId: request.params.id,
      });
      return { success: true, data };
    },
  );
}
