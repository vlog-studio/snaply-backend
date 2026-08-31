import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { AdRewardStatus } from '../model/ad-reward';
import { adRewardStatusDtoSchema, mapAdRewardStatus } from './ad-reward.dto';
import { mockAdRewardStatus } from './mock-ad-rewards';

async function getAdRewardStatusFromApi(
  rewardId: string,
  signal?: AbortSignal,
): Promise<AdRewardStatus> {
  const dto = await apiRequest(apiPath('/billing/ad-rewards/{rewardId}', { rewardId }), {
    method: 'GET',
    schema: adRewardStatusDtoSchema,
    signal,
    // The hook is holding a "지급 확인 중" state on this answer; a hung poll
    // must fail into the next one rather than outlive the whole settle window.
    timeoutMs: 4000,
  });
  return mapAdRewardStatus(dto);
}

function getAdRewardStatusMock(rewardId: string): Promise<AdRewardStatus> {
  return Promise.resolve(mockAdRewardStatus(rewardId));
}

/**
 * Where a reward session stands (`GET /billing/ad-rewards/{rewardId}`). The
 * grant is written by the ad network's server-side callback, never by the
 * app, so this poll is the app's only way to learn it landed. Routes to the
 * in-code mock until an API origin is configured.
 */
export function getAdRewardStatus(rewardId: string, signal?: AbortSignal): Promise<AdRewardStatus> {
  return USE_MOCK_API
    ? getAdRewardStatusMock(rewardId)
    : getAdRewardStatusFromApi(rewardId, signal);
}
