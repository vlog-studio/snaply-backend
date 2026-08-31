/**
 * Web variant of the local JSON store. Backs persistence with `localStorage`
 * when available (browser) and falls back to an in-memory map otherwise (SSR,
 * tests). Same `StateStorage` contract as the native file-based adapter so
 * consumers never branch on platform.
 */
const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const localStore = {
  async getItem(key: string): Promise<string | null> {
    const store = backing();
    return store ? store.getItem(key) : (memory.get(key) ?? null);
  },
  async setItem(key: string, value: string): Promise<void> {
    const store = backing();
    if (store) store.setItem(key, value);
    else memory.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    const store = backing();
    if (store) store.removeItem(key);
    else memory.delete(key);
  },
};
