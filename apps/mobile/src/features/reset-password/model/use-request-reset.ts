import { useState } from 'react';

import { isSupabaseConfigured } from '@/shared/lib/supabase';

import { mockResetPasswordProvider } from './mock-reset-password-provider';
import type { ResetPasswordProvider } from './reset-password-provider';
import { supabaseResetPasswordProvider } from './supabase-reset-password-provider';

const REQUEST_ERROR_MESSAGE = '요청에 실패했어요. 잠시 후 다시 시도해 주세요.';

const provider: ResetPasswordProvider =
  __DEV__ && !isSupabaseConfigured ? mockResetPasswordProvider : supabaseResetPasswordProvider;

/**
 * Step 1 of password reset: email a recovery link, then show the
 * check-your-email notice. Completing the reset happens out of band — tapping
 * the link deep-links back and the guard shows the update-password screen.
 */
export function useRequestReset() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestReset(nextEmail: string): Promise<void> {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    const trimmed = nextEmail.trim();
    try {
      await provider.requestReset(trimmed);
      setEmail(trimmed);
      setSent(true);
    } catch {
      setError(REQUEST_ERROR_MESSAGE);
    } finally {
      setIsPending(false);
    }
  }

  async function resend(): Promise<void> {
    if (isPending || !email) return;
    setError(null);
    try {
      await provider.requestReset(email);
    } catch {
      setError(REQUEST_ERROR_MESSAGE);
    }
  }

  return { sent, email, isPending, error, requestReset, resend };
}
