import type { SNAP_ANALYSIS_CONSENT_VERSION } from '@vlog-studio/shared-types';

/**
 * The version of the consent wording this build shows (`AnalysisConsentSheet`).
 *
 * A consent is to the words the user was shown, so the server records the
 * version the app sends and refuses one that is not current
 * (`docs/decisions/snap-content-analysis.md` §6.1, specs ANA-5). The value is
 * repeated here because the contract package is a type-only dependency of the
 * app — but it is typed as the contract's literal, so when the server's
 * wording moves on, this build stops type-checking until the sheet's copy and
 * this value are changed together.
 */
export const AnalysisConsentVersion: typeof SNAP_ANALYSIS_CONSENT_VERSION = '2026-09-29';
