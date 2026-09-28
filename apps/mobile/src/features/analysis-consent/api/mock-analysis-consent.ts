import type { AnalysisConsent } from '../model/analysis-consent';

/**
 * Mock mode has no server to send frames through, so it answers the way a
 * server with analysis switched off does: nothing is offered. The write
 * branches are unreachable from the screens (nothing offers the question) and
 * exist only to keep every request's return type identical in both modes.
 */
export function mockAnalysisConsent(granted: boolean): Promise<AnalysisConsent> {
  if (__DEV__) console.log('[analysis-consent][mock] answered without a server');
  return Promise.resolve({ available: false, granted, grantedAt: granted ? new Date() : null });
}
