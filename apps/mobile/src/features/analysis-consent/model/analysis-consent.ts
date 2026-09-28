/**
 * Whether the signed-in account lets the app analyse its snaps.
 *
 * Analysis is opt-in (specs ANA-5): frames of a snap go to an outside provider
 * only after the user said yes to the wording this build shows, and the server
 * refuses every analysis and recommendation request without that yes.
 */
export type AnalysisConsent = {
  /**
   * The question can be asked: the server has analysis switched on, and this
   * build shows the wording the server records consents to.
   */
  available: boolean;
  /** The user agreed to the current wording and has not withdrawn. */
  granted: boolean;
  grantedAt: Date | null;
};
