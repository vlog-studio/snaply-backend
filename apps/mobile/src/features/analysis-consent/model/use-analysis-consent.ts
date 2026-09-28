import { useQuery } from '@tanstack/react-query';

import { analysisConsentQueries } from '../api/analysis-consent.queries';

import type { AnalysisConsent } from './analysis-consent';

/** What the screens act on until the server has answered. */
const Unknown: AnalysisConsent = { available: false, granted: false, grantedAt: null };

export type AnalysisConsentState = AnalysisConsent & {
  /** The server has answered. Before that, nothing is offered and nothing is sent. */
  isLoaded: boolean;
};

/**
 * The signed-in account's analysis consent.
 *
 * While the read is in flight — and when it fails — the answer is "not
 * available, not granted": the safe reading is the one that sends no frames and
 * asks nothing. The server enforces the same rule on its side regardless.
 */
export function useAnalysisConsent(): AnalysisConsentState {
  const query = useQuery(analysisConsentQueries.status());
  return { ...(query.data ?? Unknown), isLoaded: query.data !== undefined };
}
