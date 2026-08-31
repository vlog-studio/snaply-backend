import * as SecureStore from 'expo-secure-store';

/**
 * Minimal persistent key-value adapter over Expo SecureStore.
 * Keys must contain only alphanumeric characters, '.', '-', and '_'.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Persistence is best-effort; the in-memory value stays authoritative.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore missing keys and storage failures.
    }
  },
};
