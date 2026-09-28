import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { AnalysisConsent } from '../model/analysis-consent';

import { analysisConsentDtoSchema, mapAnalysisConsent } from './analysis-consent.dto';
import { mockAnalysisConsent } from './mock-analysis-consent';

/**
 * Withdraws the consent (`DELETE /auth/me/analysis-consent`). The server stops
 * analysing and destroys the analyses and recommendations it made for this
 * account; the snaps themselves stay.
 */
export async function withdrawAnalysisConsent(): Promise<AnalysisConsent> {
  if (USE_MOCK_API) return mockAnalysisConsent(false);
  const dto = await apiRequest('/auth/me/analysis-consent', {
    method: 'DELETE',
    schema: analysisConsentDtoSchema,
  });
  return mapAnalysisConsent(dto);
}
