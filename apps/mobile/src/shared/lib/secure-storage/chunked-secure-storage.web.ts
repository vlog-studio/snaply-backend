/**
 * Web variant backed by localStorage. localStorage has no per-value size limit
 * that matters here, so chunking is unnecessary — a single key holds the whole
 * value. Same Public API contract as the native chunked SecureStore adapter.
 */
export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Persistence is best-effort; the in-memory session stays authoritative.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore missing keys and storage failures.
    }
  },
};
