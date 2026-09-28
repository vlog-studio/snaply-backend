import { z } from 'zod';

import type { AnalysisConsent } from '../model/analysis-consent';

import { AnalysisConsentVersion } from './consent-version';

/** The wire shape all three `/auth/me/analysis-consent` endpoints answer with. */
export const analysisConsentDtoSchema = z.object({
  available: z.boolean(),
  currentVersion: z.string(),
  granted: z.boolean(),
  grantedAt: z.string().nullable(),
});

export type AnalysisConsentDto = z.infer<typeof analysisConsentDtoSchema>;

/**
 * The server's answer, as this build can act on it.
 *
 * A server whose wording is newer than the one this build ships reads as
 * unavailable: asking would show the user words the server no longer records a
 * consent to, and the request would be refused anyway.
 */
export function mapAnalysisConsent(dto: AnalysisConsentDto): AnalysisConsent {
  return {
    available: dto.available && dto.currentVersion === AnalysisConsentVersion,
    granted: dto.granted,
    grantedAt: dto.grantedAt === null ? null : new Date(dto.grantedAt),
  };
}
