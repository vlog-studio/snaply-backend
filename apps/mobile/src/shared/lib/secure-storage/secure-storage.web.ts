/**
 * Web variant backed by localStorage. Same Public API contract as the
 * native SecureStore adapter.
 */
export const secureStorage = {
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
      // Persistence is best-effort; the in-memory value stays authoritative.
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
