import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { ServerSnapFate } from '../model/server-snap';
import { mapServerSnapFate, serverSnapLookupDtoSchema } from './server-snap.dto';

/**
 * The contract's cap on ids per call (`VIDEO_LOOKUP_MAX_IDS`). Restated rather
 * than imported: the app takes only types from the contract package, so its
 * runtime values stay out of the bundle (docs/workflows/api-contract-integration.md).
 */
const LookupBatchSize = 100;

async function lookupFromApi(
  videoIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, ServerSnapFate>> {
  const fates = new Map<string, ServerSnapFate>();
  for (let start = 0; start < videoIds.length; start += LookupBatchSize) {
    const ids = videoIds.slice(start, start + LookupBatchSize);
    const answer = await apiRequest('/videos/lookup', {
      method: 'POST',
      body: { ids },
      schema: serverSnapLookupDtoSchema,
      signal,
    });
    for (const item of answer.items) {
      const fate = mapServerSnapFate(item);
      if (fate) fates.set(item.id, fate);
    }
  }
  return fates;
}

function lookupMock(videoIds: readonly string[]): Promise<Map<string, ServerSnapFate>> {
  return Promise.resolve(new Map(videoIds.map((id) => [id, { state: 'live' } as const])));
}

/**
 * What became of snaps that left the server's list (`POST /videos/lookup`):
 * still there, deleted by the user, or expired. An id the server does not
 * answer for has no row at all — it is absent from the map, and the caller
 * decides what that means.
 *
 * Mock mode answers "still there" for every id, which never deletes anything.
 */
export function lookupServerSnaps(
  videoIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, ServerSnapFate>> {
  if (videoIds.length === 0) return Promise.resolve(new Map());
  return USE_MOCK_API ? lookupMock(videoIds) : lookupFromApi(videoIds, signal);
}
