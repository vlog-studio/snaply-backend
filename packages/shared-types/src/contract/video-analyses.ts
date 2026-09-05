import { z } from 'zod';

import {
  AUTHENTICATED_ERROR_RESPONSES,
  apiErrorSchema,
  apiSuccess,
  conflictErrorSchema,
} from './common.js';
import { defineRoute } from './define-route.js';
import { VIDEO_ANALYSIS_ERROR_CODES, videoAnalysisStatusSchema } from './vocab.js';

/** 자동 편집 후보로 쓸 수 있는지의 판단. 오디오는 반영하지 않는다. */
export const videoVisualQualitySchema = z.object({
  score: z.number().min(0).max(1),
  issues: z.array(z.string()),
  usableForEdit: z.boolean().describe('자동 편집 후보로 쓸 수 있는지. 추천이 1차로 보는 값이다.'),
});
export type VideoVisualQuality = z.infer<typeof videoVisualQualitySchema>;

export const videoAnalysisResultSchema = z.object({
  durationMs: z.int().nullable().describe('워커가 FFprobe 로 실측한 길이. 클라이언트가 보고한 값이 아니다.'),
  frameTimestampsMs: z.array(z.int()),
  summary: z.string(),
  topics: z.array(z.string()),
  places: z.array(z.string()),
  objects: z.array(z.string()),
  actions: z.array(z.string()),
  moods: z.array(z.string()),
  visualQuality: videoVisualQualitySchema,
  confidence: z.number().min(0).max(1).nullable(),
});
export type VideoAnalysisResult = z.infer<typeof videoAnalysisResultSchema>;

export const videoAnalysisErrorSchema = z.object({
  code: z.string().describe(`분류 코드. 알려진 값: ${VIDEO_ANALYSIS_ERROR_CODES.join(' | ')}`),
  retryable: z.boolean().describe('false 면 다시 요청해도 같은 결과다(손상된 영상·정책 거절 등).'),
});

export const videoAnalysisSchema = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    version: z.int().min(1),
    status: videoAnalysisStatusSchema,
    /** status 가 'done' 일 때만 채워진다. */
    result: videoAnalysisResultSchema.nullable(),
    error: videoAnalysisErrorSchema.nullable(),
    /** 어떤 모델·프롬프트로 얻은 결과인지. 완료 전에는 null. */
    modelVersion: z.string().nullable(),
    promptVersion: z.string().nullable(),
    attempts: z.int().min(0),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'VideoAnalysis' });
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;

export const analysisQueuedSchema = z.object({
  analysisId: z.uuid(),
  version: z.int().min(1),
  status: z.enum(['queued', 'processing', 'done']),
});
export type AnalysisQueued = z.infer<typeof analysisQueuedSchema>;

const videoIdParamsSchema = z.object({
  videoId: z.uuid().describe('분석할 source 영상 id'),
});

export const requestVideoAnalysis = defineRoute({
  method: 'POST',
  path: '/videos/{videoId}/analysis',
  schema: {
    params: videoIdParamsSchema,
    response: {
      202: apiSuccess(analysisQueuedSchema),
      400: apiErrorSchema,
      404: apiErrorSchema,
      409: conflictErrorSchema,
      503: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getVideoAnalysis = defineRoute({
  method: 'GET',
  path: '/videos/{videoId}/analysis',
  schema: {
    params: videoIdParamsSchema,
    response: {
      200: apiSuccess(videoAnalysisSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
