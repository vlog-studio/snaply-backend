import type { User } from '@/entities/session';

/**
 * Thrown when sign-in is rejected because the account's email has not been
 * verified yet. The action hook maps it to a distinct message that points the
 * user at the OTP verification step instead of the generic credentials error.
 */
export class EmailNotConfirmedError extends Error {
  constructor() {
    super('Email address has not been confirmed.');
    this.name = 'EmailNotConfirmedError';
  }
}

/**
 * Email/password sign-in seam. Kept behind an interface — like the social
 * `AuthProvider` — so the Supabase implementation swaps for the offline mock in
 * development without touching the screen or the session store.
 */
export interface EmailAuthProvider {
  signIn(email: string, password: string): Promise<User>;
}
