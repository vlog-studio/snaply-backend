// A deliberately permissive check: one `@`, non-empty local part, and a dotted
// domain. Email correctness is ultimately confirmed by the verification step, so
// this only guards obvious typos before a network round-trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
