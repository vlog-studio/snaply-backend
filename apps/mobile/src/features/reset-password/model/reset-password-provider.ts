/**
 * Password-reset seam (deep-link recovery). `requestReset` emails a recovery
 * link that deep-links back into the app; the global deep-link handler exchanges
 * the code for a recovery session. `updatePassword` then sets the new password
 * on that session. Behind an interface so Supabase swaps for the offline mock.
 */
export interface ResetPasswordProvider {
  /** Email a recovery link. Resolves even for unknown addresses (no enumeration). */
  requestReset(email: string): Promise<void>;
  /** Set a new password on the current (recovery) session. */
  updatePassword(password: string): Promise<void>;
}
