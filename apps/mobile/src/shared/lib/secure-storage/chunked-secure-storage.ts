import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore rejects (or warns and drops on some Android devices) values whose
 * UTF-8 size exceeds ~2048 bytes. A Supabase auth session — access token,
 * refresh token, and user metadata as one JSON string — routinely crosses that
 * limit, so this adapter transparently splits a large value across numbered
 * SecureStore keys and reassembles it on read. Small values still take a single
 * chunk. Keys stay within SecureStore's allowed alphabet (alphanumerics plus
 * '.', '-', '_') because we only append '.<n>' / '.chunks' to the base key.
 *
 * The native SecureStore keychain/keystore keeps every chunk encrypted at rest,
 * which is why auth tokens live here rather than in plain AsyncStorage.
 */
const MAX_CHUNK_BYTES = 1800;

const chunkCountKey = (key: string): string => `${key}.chunks`;
const chunkKey = (key: string, index: number): string => `${key}.${index}`;

/** UTF-8 byte length of a single code point. */
function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * Split a string into pieces each ≤ maxBytes UTF-8 bytes. Iterating with
 * `for...of` walks whole code points, so a surrogate pair (e.g. an emoji in a
 * display name) is never split across a chunk boundary and round-trips intact.
 */
export function splitByUtf8Bytes(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of value) {
    const bytes = utf8Length(char.codePointAt(0) ?? 0);
    if (currentBytes + bytes > maxBytes && current.length > 0) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function removeChunks(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
  if (countRaw == null) return;
  const count = Number(countRaw);
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
  await SecureStore.deleteItemAsync(chunkCountKey(key));
}

/**
 * Chunk-aware persistent key-value adapter over Expo SecureStore. Same contract
 * as the plain `secureStorage` adapter, safe for values of any size.
 */
export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
      if (countRaw == null) return null;
      const count = Number(countRaw);
      let value = '';
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        if (part == null) return null; // partial/corrupt write — treat as absent
        value += part;
      }
      return value;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await removeChunks(key);
      const parts = splitByUtf8Bytes(value, MAX_CHUNK_BYTES);
      for (let i = 0; i < parts.length; i += 1) {
        await SecureStore.setItemAsync(chunkKey(key, i), parts[i]);
      }
      await SecureStore.setItemAsync(chunkCountKey(key), String(parts.length));
    } catch {
      // Persistence is best-effort; the in-memory session stays authoritative.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await removeChunks(key);
    } catch {
      // Ignore missing keys and storage failures.
    }
  },
};
