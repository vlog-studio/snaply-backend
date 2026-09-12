/**
 * A random UUID (version 4), for an id the device mints before the server has
 * heard of the thing it names.
 *
 * Hermes exposes `crypto.randomUUID` on the platforms this app ships to, and
 * that is used when present; the arithmetic fallback keeps the function total
 * on a runtime without it (Jest, an older web engine). The fallback's
 * randomness is `Math.random` — enough for ids that only ever have to be
 * unique among one account's own records, and never used for anything secret.
 */
export function randomUuid(): string {
  const native = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof native?.randomUUID === 'function') return native.randomUUID();

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether a string is shaped like a UUID — what the backend's `z.uuid()` accepts. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
