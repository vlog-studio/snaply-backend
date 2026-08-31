import { useUploadWorker } from '../model/use-upload-worker';

/**
 * Mount point for the snap upload worker. Rendered once for the whole app
 * (`_app/providers`), not by the snap screens: uploading is a property of
 * having captured, and it must keep going wherever the user navigates.
 */
export function SnapUploadGate(): null {
  useUploadWorker();
  return null;
}
