/** Thrown when the email is already registered to an existing account. */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('This email is already registered.');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/** Outcome of a sign-up request. */
type SignUpResult = {
  /**
   * True when the project requires email confirmation, so no session was issued
   * and the user must confirm via the emailed link. False when confirmation is
   * disabled and Supabase already issued a session (mirrored by the store's
   * listener, which drops the user straight into the app).
   */
  needsConfirmation: boolean;
};

/**
 * Sign-up seam. Behind an interface so the Supabase implementation swaps for the
 * offline mock in development. Confirmation is completed by tapping the emailed
 * link (deep link → `exchangeCodeForSession`, handled globally), so this seam
 * only creates the account and re-sends the confirmation email.
 */
export interface SignUpProvider {
  signUp(email: string, password: string): Promise<SignUpResult>;
  /** Re-send the sign-up confirmation link to the same address. */
  resend(email: string): Promise<void>;
}
