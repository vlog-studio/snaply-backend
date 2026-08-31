import type { RewardAdProvider } from './reward-ad-provider';

/**
 * Stands in for the rewarded-ad SDK until one is installed: "shows" for a
 * moment and reports the reward point reached. The pause is there so the
 * showing state is visible in development instead of flashing past.
 */
export const mockRewardAdProvider: RewardAdProvider = {
  async show() {
    if (__DEV__) console.log('[watch-reward-ad][mock] rewarded ad shown');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return 'earned';
  },
};
