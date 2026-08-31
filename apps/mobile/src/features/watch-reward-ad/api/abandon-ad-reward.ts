import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { AdRewardStatus } from '../model/ad-reward';
import { adRewardStatusDtoSchema, mapAdRewardStatus } from './ad-reward.dto';
import { mockAbandonAdReward } from './mock-ad-rewards';

async function abandonAdRewardFromApi(
  rewardId: string,
  signal?: AbortSignal,
): Promise<AdRewardStatus> {
  const dto = await apiRequest(apiPath('/billing/ad-rewards/{rewardId}', { rewardId }), {
    method: 'DELETE',
    schema: adRewardStatusDtoSchema,
    signal,
  });
  return mapAdRewardStatus(dto);
}

function abandonAdRewardMock(rewardId: string): Promise<AdRewardStatus> {
  return Promise.resolve(mockAbandonAdReward(rewardId));
}

/**
 * Give the reward slot back (`DELETE /billing/ad-rewards/{rewardId}`) so the
 * next session can be issued without waiting out the session TTL.
 *
 * Called when the app *knows* no callback is coming — the user closed the ad
 * before its reward point, or there was no ad to show. That is information
 * only the client has, and handing it back is the one thing the client may
 * safely tell the server about a reward: it can only ever cost the user, so
 * there is nothing to abuse. **It does not forfeit the grant** — the session
 * stays eligible until it expires, so a callback already in flight still pays.
 *
 * Not called after a `pending` settle: an ad that reached its reward point may
 * still be paid, and the wait is the same either way now that the session TTL
 * matches the cooldown. Routes to the in-code mock until an API origin is
 * configured.
 */
export function abandonAdReward(rewardId: string, signal?: AbortSignal): Promise<AdRewardStatus> {
  return USE_MOCK_API ? abandonAdRewardMock(rewardId) : abandonAdRewardFromApi(rewardId, signal);
}
