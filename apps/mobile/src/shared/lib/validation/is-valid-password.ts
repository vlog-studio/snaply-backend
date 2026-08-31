/** Minimum password length accepted at sign-up / password reset. */
export const PASSWORD_MIN_LENGTH = 8;

export function isValidPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH;
}
