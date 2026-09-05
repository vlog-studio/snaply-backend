import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiErrorWith, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';
import { movieRecommendationStatusSchema, recommendationExclusionReasonSchema } from './vocab.js';

/** 추천 1회가 분석할 수 있는 후보 수. 슬롯 최대 6개의 2배. */
export const MAX_RECOMMENDATION_CANDIDATES = 12;

export const recommendationBodySchema = z.object({
  templateId: z.string().min(1).describe('GET /movie-templates 의 템플릿 id'),
  // 개수 상한은 여기서 걸지 않는다. 스키마가 먼저 자르면 클라이언트는 몇 개까지 되는지
  // 알 수 없는 일반 검증 오류를 받는다 — 서비스가 `TOO_MANY_CANDIDATES` + `max` 로 답한다.
  candidates: z
    .array(z.uuid())
    .describe(
      `후보 스냅의 videoId, **촬영 시간 오름차순**. 이 순서가 점수화의 시간 사전값이다. 최대 ${MAX_RECOMMENDATION_CANDIDATES}개`,
    ),
});
export type RecommendationBody = z.infer<typeof recommendationBodySchema>;

export const recommendationAcceptedSchema = z.object({
  id: z.uuid(),
  status: movieRecommendationStatusSchema,
});
export type RecommendationAccepted = z.infer<typeof recommendationAcceptedSchema>;

/** 슬롯 하나에 대한 서버의 제안. `videoId` 가 null 이면 채울 후보가 없었다는 뜻이다. */
export const movieRecommendationSlotSchema = z.object({
  slotId: z.string(),
  videoId: z.uuid().nullable().describe('null 이면 채울 후보가 없었다는 뜻'),
  score: z.number().nullable().describe('0~1 슬롯 적합도. 스냅 내용에 대한 주장이 아니다'),
});
export type MovieRecommendationSlot = z.infer<typeof movieRecommendationSlotSchema>;

export const movieRecommendationExclusionSchema = z.object({
  videoId: z.uuid(),
  reason: recommendationExclusionReasonSchema,
});
export type MovieRecommendationExclusion = z.infer<typeof movieRecommendationExclusionSchema>;

/**
 * 템플릿 슬롯을 어떤 스냅으로 채울지에 대한 서버의 제안 1건.
 *
 * 앱은 이걸 기다리지 않는다 — 로컬 매칭이 먼저 화면을 채우고, 이 결과가 도착하면 사용자가
 * 손대지 않은 슬롯에만 얹힌다.
 */
export const movieRecommendationSchema = z
  .object({
    id: z.uuid(),
    templateId: z.string(),
    status: movieRecommendationStatusSchema,
    slots: z
      .array(movieRecommendationSlotSchema)
      .describe('템플릿의 슬롯 순서 그대로. done 이 되기 전에는 비어 있다'),
    excluded: z.array(movieRecommendationExclusionSchema),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'MovieRecommendation' });
export type MovieRecommendation = z.infer<typeof movieRecommendationSchema>;

/**
 * 후보 수 상한 초과 400. `max` 를 함께 내려야 앱이 "몇 개까지 보낼 수 있는지"를 하드코딩하지
 * 않는다 — 상한은 서버 정책이고 실측 후 바뀐다.
 */
export const candidateLimitErrorSchema = apiErrorWith({
  max: z.int().optional().describe('추천 1회에 보낼 수 있는 후보 수'),
});

export const requestMovieRecommendation = defineRoute({
  method: 'POST',
  path: '/movie-recommendations',
  schema: {
    body: recommendationBodySchema,
    response: {
      202: apiSuccess(recommendationAcceptedSchema),
      400: candidateLimitErrorSchema,
      404: apiErrorSchema,
      503: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getMovieRecommendation = defineRoute({
  method: 'GET',
  path: '/movie-recommendations/{id}',
  schema: {
    params: z.object({ id: z.uuid() }),
    response: {
      200: apiSuccess(movieRecommendationSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
