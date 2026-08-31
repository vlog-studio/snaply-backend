/**
 * What the backend answers for `GET /billing/ad-rewards` — the only source of
 * the reward amount, the daily limit, and whether the door is open at all.
 * The app hardcodes none of these; a policy change lands without a release.
 */
export type AdRewardAvailability = {
  /** The kill switch. `false` hides the entry point entirely. */
  enabled: boolean;
  /** Credits one completed ad pays. */
  rewardCredits: number;
  dailyLimit: number;
  remainingToday: number;
  /** Set only while a cooldown is running; absent means "now is fine". */
  nextAvailableAt?: Date;
  /** When `remainingToday` returns to `dailyLimit`. */
  resetsAt: Date;
};

/**
 * One issued reward session (`POST /billing/ad-rewards`). `nonce` rides the
 * ad SDK's `customData` and `ssvUserId` its `userId`, which is how the SSV
 * callback finds its way back to this session — the app itself never reports
 * a completed view.
 */
export type AdRewardSession = {
  rewardId: string;
  nonce: string;
  ssvUserId: string;
  /** Snapshotted at issue time, so a policy change keeps this session's promise. */
  rewardCredits: number;
  expiresAt: Date;
};

/**
 * Where a session stands (`GET /billing/ad-rewards/{rewardId}`).
 *
 * `pending` is a normal state, not a failure — the grant travels ad network →
 * backend and may land after the app stops watching. `abandoned` is a session
 * the app gave the slot back for (see `abandonAdReward`); it keeps its grant
 * eligibility, so a late callback still turns it into `granted`.
 */
export type AdRewardStatus = {
  rewardId: string;
  status: 'pending' | 'abandoned' | 'granted' | 'expired' | 'rejected';
  /** Credits actually granted; only present once `granted`. */
  credits?: number;
  /** The current balance, so a settled poll needs no second request. */
  balance: number;
};
