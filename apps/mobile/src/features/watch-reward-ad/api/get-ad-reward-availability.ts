import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { AdRewardAvailability } from '../model/ad-reward';
import { adRewardAvailabilityDtoSchema, mapAdRewardAvailability } from './ad-reward.dto';
import { mockAdRewardAvailability } from './mock-ad-rewards';

async function getAdRewardAvailabilityFromApi(signal?: AbortSignal): Promise<AdRewardAvailability> {
  const dto = await apiRequest('/billing/ad-rewards', {
    method: 'GET',
    schema: adRewardAvailabilityDtoSchema,
    signal,
  });
  return mapAdRewardAvailability(dto);
}

// Same return type as the API branch; the counters live in mock-ad-rewards.ts
// so mock grants use up the mock daily limit like the real ones would.
function getAdRewardAvailabilityMock(): Promise<AdRewardAvailability> {
  return Promise.resolve(mockAdRewardAvailability());
}

/**
 * Whether a rewarded ad can be watched right now, and what it pays
 * (`GET /billing/ad-rewards`). The server decides all of it — amount, limit,
 * cooldown, and the kill switch — so the answer is displayed, never derived.
 * Routes to the in-code mock until an API origin is configured.
 */
export function getAdRewardAvailability(signal?: AbortSignal): Promise<AdRewardAvailability> {
  return USE_MOCK_API ? getAdRewardAvailabilityMock() : getAdRewardAvailabilityFromApi(signal);
}
