import { useLegacyChoicesUpload } from '../model/use-legacy-choices-upload';

/**
 * Headless mount point for the one-time upload of the notification choices an
 * older build kept on this device. Render once high in the tree, after the
 * library scope is bound, so it writes to the account that is signed in.
 */
export function LegacyChoicesUploadGate(): null {
  useLegacyChoicesUpload();
  return null;
}
