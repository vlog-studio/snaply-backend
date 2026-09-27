import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { ServerSnap } from '../model/server-snap';
import { mapServerSnap, serverSnapPageDtoSchema } from './server-snap.dto';

/** The server's page cap; the most per request keeps the read short. */
const PageSize = 50;

async function getFromApi(signal?: AbortSignal): Promise<ServerSnap[]> {
  const snaps: ServerSnap[] = [];
  let cursor: string | undefined;
  do {
    const page = await apiRequest('/videos', {
      method: 'GET',
      query: { kind: 'source', limit: PageSize, ...(cursor ? { cursor } : null) },
      schema: serverSnapPageDtoSchema,
      signal,
    });
    for (const dto of page.items) snaps.push(mapServerSnap(dto));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return snaps;
}

/**
 * Every snap the account holds on the server (`GET /videos?kind=source`, all
 * pages).
 *
 * Read whole, and only whole: the reconcile draws conclusions from what is
 * *missing* from this list, so a partial read must fail rather than return what
 * it got — a page that did not arrive would look like snaps that were deleted.
 * The list is bounded by the retention period (SNAP-9), so it stays in the
 * hundreds even for a heavy user.
 *
 * Mock mode has no server and so no snaps from anywhere else.
 */
export function getServerSnaps(signal?: AbortSignal): Promise<ServerSnap[]> {
  return USE_MOCK_API ? Promise.resolve([]) : getFromApi(signal);
}
