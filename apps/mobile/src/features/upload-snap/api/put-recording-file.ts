import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

import { USE_MOCK_API } from '@/shared/config/api';

async function putToApi(uploadUrl: string, fileUri: string, contentType: string): Promise<void> {
  const file = new File(fileUri);
  if (!file.exists) {
    throw new Error('The recording file to upload no longer exists.');
  }
  // `File` implements the Blob interface, so it streams as the request body.
  // The Content-Type must be exactly what the URL was presigned with, or the
  // storage service rejects the PUT.
  const response = await expoFetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Presigned upload failed with status ${response.status}.`);
  }
}

// A short pause so dev builds show the uploading state instead of flashing it.
function putMock(): Promise<void> {
  if (__DEV__) console.log('[upload-snap][mock] file bytes uploaded');
  return new Promise((resolve) => setTimeout(resolve, 600));
}

/**
 * PUT a snap's video file to its presigned URL. This transfer goes straight to
 * object storage — no auth header, no response envelope — so it bypasses
 * `apiRequest` on purpose. Routes to the mock until an API origin is configured.
 */
export function putRecordingFile(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  return USE_MOCK_API ? putMock() : putToApi(uploadUrl, fileUri, contentType);
}
