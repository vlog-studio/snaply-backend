import { Directory, File, Paths } from 'expo-file-system';

/**
 * File-based JSON key-value adapter over the app's document directory. It fills
 * the "local metadata store" gap for general, growing data (snaps, movies) that
 * does not belong in SecureStore — SecureStore is for small secrets and has a
 * per-value size limit, whereas snap/movie collections grow without bound.
 *
 * Shaped as a zustand `StateStorage`, so a persisted store can back its
 * `persist(...)` middleware with `createJSONStorage(() => localStore)`. Each key
 * is stored as one JSON file under `<document>/store/`.
 *
 * Once these entities move to a backend, the persisted stores that use this
 * adapter become server-backed queries/mutations and this adapter is dropped
 * (see the entity store headers for the migration note).
 */
const STORE_DIRECTORY_NAME = 'store';

const storeDirectory = new Directory(Paths.document, STORE_DIRECTORY_NAME);

function ensureStoreDirectory(): void {
  storeDirectory.create({ idempotent: true, intermediates: true });
}

/** Keep filenames within a safe alphabet, mirroring SecureStore key hygiene. */
function fileForKey(key: string): File {
  const safeName = key.replace(/[^A-Za-z0-9._-]/g, '_');
  return new File(storeDirectory, `${safeName}.json`);
}

export const localStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      ensureStoreDirectory();
      const file = fileForKey(key);
      return file.exists ? await file.text() : null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      ensureStoreDirectory();
      const file = fileForKey(key);
      if (!file.exists) file.create({ intermediates: true });
      file.write(value);
    } catch {
      // Persistence is best-effort; the in-memory store stays authoritative.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const file = fileForKey(key);
      if (file.exists) file.delete();
    } catch {
      // Ignore missing keys and storage failures.
    }
  },
};
