// Web has no local-file share sheet in this app: recordings live in the native
// document directory and never exist on web. These inert stubs mirror the native
// adapter's contract so shared consumers stay platform-agnostic.
export function canShareFiles(): Promise<boolean> {
  return Promise.resolve(false);
}

export function shareFile(_uri: string, _options?: unknown): Promise<void> {
  return Promise.resolve();
}
