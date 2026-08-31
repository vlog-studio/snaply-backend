/** What the ad SDK must carry so the SSV callback can find the session. */
type RewardAdRequest = {
  /** Rides the SDK's `customData`. */
  nonce: string;
  /** Rides the SDK's `userId`. */
  ssvUserId: string;
};

/**
 * How a shown ad ended, from the app's side only.
 *
 * `earned` — the SDK fired its reward event. This is a hint to start polling,
 * never proof of a grant: the grant is decided by the server when the ad
 * network's SSV callback arrives.
 * `dismissed` — the user closed the ad before the reward point.
 * `unavailable` — no ad to show (no fill, not loaded, SDK error).
 */
type RewardAdResult = 'earned' | 'dismissed' | 'unavailable';

/**
 * The seam in front of the rewarded-ad SDK, so screens and the flow hook
 * never learn which network is wired in — the AdMob implementation replaces
 * the mock without touching either (same split as `sign-in`'s AuthProvider).
 */
export interface RewardAdProvider {
  /** Load and show one rewarded ad; resolves when the ad closes. */
  show(request: RewardAdRequest): Promise<RewardAdResult>;
}
