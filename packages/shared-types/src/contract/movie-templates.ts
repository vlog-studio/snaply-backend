import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';
import { stylePresetSchema } from './vocab.js';

/**
 * 무비 템플릿의 한 장면.
 *
 * `label`·`hint` 는 **사람에게 보여주는 촬영 지시**다. 슬롯에 들어간 스냅의 내용을 주장하지
 * 않는다 — `골목` 슬롯은 "여기에 골목을 찍어 오라"는 뜻이지 "이 스냅은 골목이다"가 아니다.
 *
 * 점수화가 쓰는 매칭 힌트(`match_hints`)는 이 계약에 없다. 내부값이고, 앱이 읽기 시작하면
 * 가중치 조정이 다시 앱 릴리스에 묶인다 (docs/decisions/template-snap-recommendation.md §2).
 */
export const movieTemplateSlotSchema = z.object({
  id: z.string().describe('템플릿 안에서만 유일한 슬롯 id. 추천 응답이 슬롯을 가리키는 키다.'),
  label: z.string().describe('장면 이름 (예: 골목)'),
  hint: z.string().describe('무엇을 찍을지에 대한 지시 (예: 좁은 길, 걷는 발)'),
});
export type MovieTemplateSlot = z.infer<typeof movieTemplateSlotSchema>;

/** 사용자가 "템플릿으로 시작"할 때 고르는 무비의 형태. */
export const movieTemplateSchema = z
  .object({
    id: z.string().describe("'walk' 처럼 고정된 사람이 읽는 id. 앱의 내장 폴백 카탈로그와 같은 값이다."),
    name: z.string(),
    description: z.string(),
    style: stylePresetSchema.describe(
      'POST /edit-jobs 가 받는 프리셋 이름 그대로. 앱이 모르는 프리셋이 오면 그 템플릿을 건너뛴다',
    ),
    bgm: z.string().describe('앱에서만 쓰는 트랙 키. 편집 파이프라인은 받지 않는다'),
    slots: z.array(movieTemplateSlotSchema).describe('촬영 순서 (`position` 오름차순)'),
  })
  .meta({ id: 'MovieTemplate' });
export type MovieTemplate = z.infer<typeof movieTemplateSchema>;

export const movieTemplateCatalogSchema = z.object({
  updatedAt: z.iso
    .datetime()
    .describe('목록에서 가장 최근에 바뀐 템플릿의 시각. 앱의 캐시 갱신 판단 근거'),
  templates: z.array(movieTemplateSchema),
});
export type MovieTemplateCatalog = z.infer<typeof movieTemplateCatalogSchema>;

export const getMovieTemplates = defineRoute({
  method: 'GET',
  path: '/movie-templates',
  schema: {
    response: {
      200: apiSuccess(movieTemplateCatalogSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
