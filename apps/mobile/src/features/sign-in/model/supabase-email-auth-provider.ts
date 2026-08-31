import { mapSupabaseUser } from '@/entities/session';
import { supabase } from '@/shared/lib/supabase';

import { EmailNotConfirmedError, type EmailAuthProvider } from './email-auth-provider';

/**
 * Real email/password sign-in over Supabase Auth. Supabase verifies the
 * credentials, issues and persists the session; the store's auth listener then
 * mirrors the derived user. A not-yet-confirmed account surfaces as a typed
 * error so the screen can route the user to verification.
 */
export const supabaseEmailAuthProvider: EmailAuthProvider = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === 'email_not_confirmed') throw new EmailNotConfirmedError();
      throw error;
    }
    if (!data.user) throw new Error('Supabase returned no user for the sign-in.');
    return mapSupabaseUser(data.user);
  },
};
