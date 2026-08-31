import { getPasswordResetUrl, supabase } from '@/shared/lib/supabase';

import type { ResetPasswordProvider } from './reset-password-provider';

/**
 * Real deep-link password reset over Supabase Auth. `resetPasswordForEmail`
 * sends a recovery link pointing at `passwordResetUrl`; tapping it deep-links
 * back and the global handler establishes a recovery session. `updateUser` then
 * changes the password on that session.
 */
export const supabaseResetPasswordProvider: ResetPasswordProvider = {
  async requestReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordResetUrl(),
    });
    if (error) throw error;
  },

  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },
};
