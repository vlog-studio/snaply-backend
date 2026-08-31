import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

export type UploadTarget = {
  /** The server's id for this video row — the snap's remote identity from here on. */
  videoId: string;
  /** Presigned URL the file bytes are PUT to. Expires; use promptly, never store. */
  uploadUrl: string;
};

// Spec-confirmed shape (the 2026-08-07 spec update added response schemas):
// the presign payload is { videoId, uploadUrl, s3Key }. Only the fields the
// app consumes are validated — `s3Key` is the server's own bookkeeping and
// passes through unparsed.
const uploadTargetSchema = z.object({
  videoId: z.string(),
  uploadUrl: z.string(),
});

async function requestFromApi(
  filename: string,
  contentType: string,
  signal?: AbortSignal,
): Promise<UploadTarget> {
  return apiRequest('/videos/upload-url', {
    method: 'GET',
    query: { filename, contentType },
    schema: uploadTargetSchema,
    signal,
  });
}

function requestMock(filename: string): Promise<UploadTarget> {
  if (__DEV__) console.log(`[upload-snap][mock] presign issued for ${filename}`);
  return Promise.resolve({
    videoId: `mock-video-${filename}`,
    uploadUrl: `https://mock.invalid/upload/${encodeURIComponent(filename)}`,
  });
}

/**
 * Ask the backend for a presigned upload slot (`GET /videos/upload-url`).
 * Routes to the mock until an API origin is configured (see `USE_MOCK_API`).
 */
export function requestUploadUrl(
  filename: string,
  contentType: string,
  signal?: AbortSignal,
): Promise<UploadTarget> {
  return USE_MOCK_API ? requestMock(filename) : requestFromApi(filename, contentType, signal);
}
