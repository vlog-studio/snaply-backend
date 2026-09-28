import { mapAnalysisConsent } from './analysis-consent.dto';
import { AnalysisConsentVersion } from './consent-version';

describe('mapAnalysisConsent', () => {
  it('reads a granted consent to the wording this build shows', () => {
    expect(
      mapAnalysisConsent({
        available: true,
        currentVersion: AnalysisConsentVersion,
        granted: true,
        grantedAt: '2026-09-29T01:02:03.000Z',
      }),
    ).toEqual({ available: true, granted: true, grantedAt: new Date('2026-09-29T01:02:03.000Z') });
  });

  it('reads the server switched off as nothing to offer', () => {
    expect(
      mapAnalysisConsent({
        available: false,
        currentVersion: AnalysisConsentVersion,
        granted: false,
        grantedAt: null,
      }).available,
    ).toBe(false);
  });

  // Asking would show words the server no longer records a yes to, and the
  // server would refuse the yes anyway (409 CONSENT_VERSION_MISMATCH).
  it('reads newer wording on the server than this build ships as unavailable', () => {
    expect(
      mapAnalysisConsent({
        available: true,
        currentVersion: '2099-01-01',
        granted: false,
        grantedAt: null,
      }).available,
    ).toBe(false);
  });
});
