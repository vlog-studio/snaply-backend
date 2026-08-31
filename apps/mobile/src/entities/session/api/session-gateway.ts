import { startAuthAutoRefresh, supabase } from '@/shared/lib/supabase';

import type { User } from '../model/user';

import { mapSupabaseUser } from './map-user';

/**
 * One authentication-backend event, already translated into the session
 * domain: who is signed in (or nobody), and whether this event landed the user
 * inside a password-recovery session.
 */
export type SessionChange = {
  user: User | null;
  isRecovery: boolean;
};

/**
 * The session entity's gateway to the authentication backend. Every Supabase
 * call and every Supabase type the session domain needs lives here, so the
 * store below it only ever sees `User`, `boolean`, and this module's contract.
 * Replacing the backend means rewriting this file, not the session state model.
 *
 * There is deliberately no interface: one implementation exists, and the module
 * boundary is already the seam tests substitute (see `session-store.test.ts`).
 */

/**
 * Subscribe to backend session changes and bind token auto-refresh to the app
 * lifecycle. The listener fires immediately with the restored (or absent)
 * initial session, which is what releases the splash overlay. Returns a cleanup
 * that both unsubscribes and stops the refresh loop.
 */
export function subscribeToSession(listener: (change: SessionChange) => void): () => void {
  const stopAutoRefresh = startAuthAutoRefresh();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    listener({
      user: session ? mapSupabaseUser(session.user) : null,
      // Belt-and-suspenders: some flows emit this event on a recovery landing.
      // The deep-link handler also flags recovery from the callback URL.
      isRecovery: event === 'PASSWORD_RECOVERY',
    });
  });

  return () => {
    subscription.unsubscribe();
    stopAutoRefresh();
  };
}

/** End the backend session. The auth listener reports the resulting sign-out. */
export async function endSession(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Exchange a PKCE code from an auth email deep link for a session. The backend
 * error is logged and swallowed here — the caller only decides what to do with
 * success or failure.
 */
export async function exchangeSessionCode(code: string): Promise<boolean> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    if (__DEV__) console.warn('[auth] deep-link code exchange failed:', error.message);
    return false;
  }
  return true;
}
