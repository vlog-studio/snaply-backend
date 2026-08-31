import type { RewardAdProvider } from './reward-ad-provider';

/**
 * Google Mobile Ads has no web SDK, so there is never an ad to show. Mirrors
 * the native adapter's contract with the one result that is always true on
 * web; the flow above treats it exactly like a no-fill on a phone.
 */
export const admobRewardAdProvider: RewardAdProvider = {
  show() {
    return Promise.resolve('unavailable');
  },
};
