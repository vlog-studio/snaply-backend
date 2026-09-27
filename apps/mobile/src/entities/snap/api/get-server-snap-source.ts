import { z } from 'zod';

import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

const sourceSchema = z.object({
  playbackUrl: z.string().nullable(),
  originalUrls: z.array(z.string()),
});

/** One row by id; a screen is waiting on it, so it does not wait for the TCP timeout. */
const SourceTimeoutMs = 8_000;

async function getFromApi(videoId: string, signal?: AbortSignal): Promise<string | undefined> {
  const dto = await apiRequest(apiPath('/videos/{id}', { id: videoId }), {
    method: 'GET',
    schema: sourceSchema,
    signal,
    timeoutMs: SourceTimeoutMs,
  });
  return dto.playbackUrl ?? dto.originalUrls[0];
}

/**
 * A fresh address to fetch a server snap's video from (`GET /videos/{id}`).
 *
 * The playable copy first: the original is whatever the phone recorded, and an
 * iPhone's HEVC/HDR may not play on another platform at all. The original is the
 * fallback for a snap whose copy was never made. Asked for at the moment of the
 * fetch because the address is signed and expires within the hour.
 */
export function getServerSnapSource(
  videoId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  return USE_MOCK_API ? Promise.resolve(undefined) : getFromApi(videoId, signal);
}
