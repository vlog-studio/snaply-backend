import { getAuthCallbackUrl, supabase } from '@/shared/lib/supabase';

import { EmailAlreadyRegisteredError, type SignUpProvider } from './sign-up-provider';

/**
 * Real sign-up over Supabase Auth. `signUp` creates the user and, with email
 * confirmation enabled (this project's setting), sends a confirmation email
 * whose link deep-links back to the app (`authCallbackUrl`); the global
 * deep-link handler exchanges the returned code for a session.
 */
export const supabaseSignUpProvider: SignUpProvider = {
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getAuthCallbackUrl() },
    });
    if (error) {
      if (error.code === 'user_already_exists') throw new EmailAlreadyRegisteredError();
      throw error;
    }
    return { needsConfirmation: data.session === null };
  },

  async resend(email) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: getAuthCallbackUrl() },
    });
    if (error) throw error;
  },
};
