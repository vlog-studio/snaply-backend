import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { AnalysisConsent } from '../model/analysis-consent';

import { analysisConsentDtoSchema, mapAnalysisConsent } from './analysis-consent.dto';
import { AnalysisConsentVersion } from './consent-version';
import { mockAnalysisConsent } from './mock-analysis-consent';

/**
 * Records a yes to the wording this build shows (`POST /auth/me/analysis-consent`).
 * Idempotent on the server; `409 CONSENT_VERSION_MISMATCH` means the wording
 * moved on under this build.
 */
export async function giveAnalysisConsent(): Promise<AnalysisConsent> {
  if (USE_MOCK_API) return mockAnalysisConsent(true);
  const dto = await apiRequest('/auth/me/analysis-consent', {
    method: 'POST',
    body: { version: AnalysisConsentVersion },
    schema: analysisConsentDtoSchema,
  });
  return mapAnalysisConsent(dto);
}
