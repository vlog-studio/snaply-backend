import { z } from 'zod';

import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/** What a finished run produced, as far as the app consumes it. */
export type EditedVideo = {
  /** The rendered file. Absent until the worker has uploaded it. */
  editedUrl?: string;
  thumbnailUrl?: string;
  /** How long the rendered file runs, when the backend measured it. */
  durationSeconds?: number;
};

const videoSchema = z.object({
  editedUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  durationSeconds: z.number().nullable(),
});

/**
 * How long to wait for the address before failing.
 *
 * The screens that ask hold a state on the answer — watch mode's stage says
 * 불러오는 중… and 공유 stays disabled — so an unbounded wait is a spinner that
 * never resolves. One row by id is a fast query when the server is there at
 * all; when it is not, the request would otherwise hang for the platform's TCP
 * timeout and do it again per retry.
 */
const AddressTimeoutMs = 8_000;

async function getFromApi(videoId: string, signal?: AbortSignal): Promise<EditedVideo> {
  const dto = await apiRequest(apiPath('/videos/{id}', { id: videoId }), {
    method: 'GET',
    schema: videoSchema,
    signal,
    timeoutMs: AddressTimeoutMs,
  });
  return {
    ...(dto.editedUrl ? { editedUrl: dto.editedUrl } : null),
    ...(dto.thumbnailUrl ? { thumbnailUrl: dto.thumbnailUrl } : null),
    ...(dto.durationSeconds !== null ? { durationSeconds: dto.durationSeconds } : null),
  };
}

// No file is produced in mock mode, and inventing a URL would make the movie
// screen try to play something that does not exist. An empty result is the
// truthful one: the movie finishes with no render file and plays its cuts.
function getMock(videoId: string): Promise<EditedVideo> {
  if (__DEV__) console.log(`[compose-movie][mock] no rendered file for ${videoId}`);
  return Promise.resolve({});
}

/**
 * Fetch the result of a finished run (`GET /videos/{id}`), addressed by the
 * job's `videoId`.
 *
 * Two things need this rather than the socket. The socket's completion message
 * carries `outputUrl` but no thumbnail, and a run that finished while the app was
 * away sends no URL at all on reconnect (see `getEditJob`) — so the durable way
 * to learn what a run produced is to ask for the video row.
 */
export function getEditedVideo(videoId: string, signal?: AbortSignal): Promise<EditedVideo> {
  return USE_MOCK_API ? getMock(videoId) : getFromApi(videoId, signal);
}
