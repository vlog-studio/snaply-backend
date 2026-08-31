import { useState } from 'react';

import { useSetSession } from '@/entities/session';
import { isSupabaseConfigured } from '@/shared/lib/supabase';

import { EmailNotConfirmedError, type EmailAuthProvider } from './email-auth-provider';
import { mockEmailAuthProvider } from './mock-email-auth-provider';
import { supabaseEmailAuthProvider } from './supabase-email-auth-provider';

const SIGN_IN_ERROR_MESSAGE = '이메일 또는 비밀번호를 확인해 주세요.';
const EMAIL_NOT_CONFIRMED_MESSAGE =
  '이메일 인증이 아직 완료되지 않았어요. 받은 인증 코드로 인증을 완료해 주세요.';

// Real email/password auth over Supabase. In development builds without Supabase
// credentials, fall back to the offline mock so the flow can be exercised end to
// end; any production build always uses Supabase. Mirrors use-sign-in.ts.
const authProvider: EmailAuthProvider =
  __DEV__ && !isSupabaseConfigured ? mockEmailAuthProvider : supabaseEmailAuthProvider;

/**
 * Orchestrates the email/password sign-in action: runs the provider, writes the
 * resulting user into the session store, and exposes pending/error state. A
 * not-yet-verified account surfaces a distinct message. Navigation is handled
 * declaratively by the root route guard once the session becomes authenticated,
 * so this hook does not navigate.
 */
export function useEmailSignIn() {
  const setSession = useSetSession();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(email: string, password: string): Promise<void> {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const user = await authProvider.signIn(email.trim(), password);
      setSession(user);
    } catch (cause) {
      setError(
        cause instanceof EmailNotConfirmedError
          ? EMAIL_NOT_CONFIRMED_MESSAGE
          : SIGN_IN_ERROR_MESSAGE,
      );
    } finally {
      setIsPending(false);
    }
  }

  return { signIn, isPending, error };
}
