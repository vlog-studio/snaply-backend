import * as Sharing from 'expo-sharing';

// Thin wrapper over expo-sharing. Transport/native concerns only — whether the
// OS offers a share sheet, and handing it one local file. What is worth sharing,
// and what to say when there is nothing to share, belong to the caller. A
// `.web.ts` sibling provides inert stubs so callers stay platform-agnostic.

/** Whether this platform can open a share sheet at all. */
export function canShareFiles(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

export type ShareFileOptions = {
  /** MIME type of the file — Android uses it to pick the target apps. */
  mimeType?: string;
  /** Android's chooser title; iOS ignores it. */
  dialogTitle?: string;
  /** iOS Uniform Type Identifier. */
  uti?: string;
};

/**
 * Open the system share sheet on a local file.
 *
 * Resolves once the sheet is dismissed — including when the user dismissed it
 * without picking anything, which the platform does not report. A share is
 * therefore "offered", never "confirmed".
 */
export function shareFile(uri: string, options: ShareFileOptions = {}): Promise<void> {
  return Sharing.shareAsync(uri, options);
}
