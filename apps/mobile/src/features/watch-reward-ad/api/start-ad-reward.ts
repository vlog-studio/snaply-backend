import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { AdRewardSession } from '../model/ad-reward';
import { adRewardSessionDtoSchema, mapAdRewardSession } from './ad-reward.dto';
import { mockStartAdReward } from './mock-ad-rewards';

async function startAdRewardFromApi(signal?: AbortSignal): Promise<AdRewardSession> {
  const dto = await apiRequest('/billing/ad-rewards', {
    method: 'POST',
    schema: adRewardSessionDtoSchema,
    signal,
  });
  return mapAdRewardSession(dto);
}

function startAdRewardMock(): Promise<AdRewardSession> {
  if (__DEV__) console.log('[watch-reward-ad][mock] reward session issued');
  return Promise.resolve(mockStartAdReward());
}

/**
 * Issue a reward session (`POST /billing/ad-rewards`) — the nonce the ad
 * carries and the id the app polls. Refusals arrive as `ApiError`s with the
 * codes the hook maps (`AD_REWARD_COOLDOWN`, `AD_REWARD_LIMIT_REACHED`,
 * `AD_REWARD_SESSION_ACTIVE`, `AD_REWARDS_DISABLED`). Routes to the in-code
 * mock until an API origin is configured.
 */
export function startAdReward(signal?: AbortSignal): Promise<AdRewardSession> {
  return USE_MOCK_API ? startAdRewardMock() : startAdRewardFromApi(signal);
}
