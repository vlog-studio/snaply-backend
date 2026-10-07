import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { TrashedSnap } from '../model/trashed-snap';

import { mapTrashedSnaps, trashListDtoSchema } from './trashed-snap.dto';

/** The account's 최근 삭제 (`GET /videos/trash`), most recently deleted first. */
export async function getTrashedSnaps(signal?: AbortSignal): Promise<TrashedSnap[]> {
  // Mock mode never sends a delete to a server, so nothing waits to come back.
  if (USE_MOCK_API) return [];
  const dto = await apiRequest('/videos/trash', {
    method: 'GET',
    schema: trashListDtoSchema,
    signal,
  });
  return mapTrashedSnaps(dto);
}
