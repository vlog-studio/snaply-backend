import { useState } from 'react';

import { useFinishPasswordRecovery } from '@/entities/session';
import { isSupabaseConfigured } from '@/shared/lib/supabase';

import { mockResetPasswordProvider } from './mock-reset-password-provider';
import type { ResetPasswordProvider } from './reset-password-provider';
import { supabaseResetPasswordProvider } from './supabase-reset-password-provider';

const UPDATE_ERROR_MESSAGE = '비밀번호를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.';

const provider: ResetPasswordProvider =
  __DEV__ && !isSupabaseConfigured ? mockResetPasswordProvider : supabaseResetPasswordProvider;

/**
 * Step 2 of password reset, reached on the update-password screen after a
 * recovery deep link established a session. Sets the new password, then ends
 * the recovery state so the route guard reveals the app. Navigation is
 * declarative (guard-driven), so this hook does not navigate.
 */
export function useUpdatePassword() {
  const finishRecovery = useFinishPasswordRecovery();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updatePassword(password: string): Promise<void> {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      await provider.updatePassword(password);
      finishRecovery();
    } catch {
      setError(UPDATE_ERROR_MESSAGE);
    } finally {
      setIsPending(false);
    }
  }

  return { updatePassword, isPending, error };
}
