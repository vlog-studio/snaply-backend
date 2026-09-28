import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { AnalysisConsent } from '../model/analysis-consent';

import { analysisConsentDtoSchema, mapAnalysisConsent } from './analysis-consent.dto';
import { mockAnalysisConsent } from './mock-analysis-consent';

/** The account's consent as the server holds it (`GET /auth/me/analysis-consent`). */
export async function getAnalysisConsent(signal?: AbortSignal): Promise<AnalysisConsent> {
  if (USE_MOCK_API) return mockAnalysisConsent(false);
  const dto = await apiRequest('/auth/me/analysis-consent', {
    method: 'GET',
    schema: analysisConsentDtoSchema,
    signal,
  });
  return mapAnalysisConsent(dto);
}
