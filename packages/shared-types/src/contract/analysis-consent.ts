import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';

/**
 * 스냅 분석 동의 문구의 버전. 앱이 보여 주는 문구가 바뀌면 올린다 — 올리면 이전 버전의 동의는
 * 효력이 없어지고 앱이 다시 묻는다. 앱과 서버가 같은 값을 읽어야 하므로 원천은 여기다
 * (docs/decisions/snap-content-analysis.md §6.1, specs ANA-5).
 */
export const SNAP_ANALYSIS_CONSENT_VERSION = '2026-09-29';

export const analysisConsentSchema = z
  .object({
    available: z
      .boolean()
      .describe('서버가 스냅 분석을 켜 두었는가. `false` 면 동의해도 분석이 돌지 않으므로 앱은 묻지 않는다.'),
    currentVersion: z.string().describe('앱이 지금 보여 줘야 하는 동의 문구의 버전.'),
    granted: z.boolean().describe('현재 버전의 문구에 동의했고 철회하지 않았는가.'),
    grantedAt: z.iso.datetime().nullable().describe('현재 버전에 동의한 시각. 동의가 없으면 `null`.'),
  })
  .meta({ id: 'AnalysisConsent' });
export type AnalysisConsent = z.infer<typeof analysisConsentSchema>;

export const grantAnalysisConsentBodySchema = z.object({
  version: z
    .string()
    .min(1)
    .max(40)
    .describe('사용자에게 보여 준 문구의 버전. `currentVersion` 과 다르면 409 — 앱이 낡은 문구를 보여 준 것이다.'),
});
export type GrantAnalysisConsentBody = z.infer<typeof grantAnalysisConsentBodySchema>;

export const getAnalysisConsent = defineRoute({
  method: 'GET',
  path: '/auth/me/analysis-consent',
  schema: {
    response: {
      200: apiSuccess(analysisConsentSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const grantAnalysisConsent = defineRoute({
  method: 'POST',
  path: '/auth/me/analysis-consent',
  schema: {
    body: grantAnalysisConsentBodySchema,
    response: {
      200: apiSuccess(analysisConsentSchema),
      400: apiErrorSchema,
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const revokeAnalysisConsent = defineRoute({
  method: 'DELETE',
  path: '/auth/me/analysis-consent',
  schema: {
    response: {
      200: apiSuccess(analysisConsentSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
