import { useState } from 'react';

import { isSupabaseConfigured } from '@/shared/lib/supabase';

import { mockSignUpProvider } from './mock-sign-up-provider';
import { EmailAlreadyRegisteredError, type SignUpProvider } from './sign-up-provider';
import { supabaseSignUpProvider } from './supabase-sign-up-provider';

const SIGN_UP_ERROR_MESSAGE = '가입에 실패했어요. 잠시 후 다시 시도해 주세요.';
const EMAIL_TAKEN_MESSAGE = '이미 가입된 이메일이에요. 로그인해 주세요.';

// Real sign-up over Supabase; the offline mock is used only in development builds
// without credentials. Mirrors the selection in features/sign-in.
const provider: SignUpProvider =
  __DEV__ && !isSupabaseConfigured ? mockSignUpProvider : supabaseSignUpProvider;

/** Which step of the sign-up flow the screen should render. */
export type SignUpStep = 'form' | 'sent';

/**
 * Orchestrates sign-up: create the account, then wait for the user to confirm
 * via the emailed link. Owns the step transition and pending/error state. The
 * actual confirmation and sign-in happen globally when the deep link lands
 * (`exchangeCodeForSession`), so this hook never verifies a code or navigates.
 */
export function useSignUpFlow() {
  const [step, setStep] = useState<SignUpStep>('form');
  const [email, setEmail] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signUp(nextEmail: string, password: string): Promise<void> {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    const trimmed = nextEmail.trim();
    try {
      const result = await provider.signUp(trimmed, password);
      setEmail(trimmed);
      // When confirmation is disabled, Supabase issues a session immediately and
      // the store's listener drops the user into the app; only show the
      // check-your-email screen when confirmation is actually required.
      if (result.needsConfirmation) setStep('sent');
    } catch (cause) {
      setError(
        cause instanceof EmailAlreadyRegisteredError ? EMAIL_TAKEN_MESSAGE : SIGN_UP_ERROR_MESSAGE,
      );
    } finally {
      setIsPending(false);
    }
  }

  async function resend(): Promise<void> {
    if (isPending || !email) return;
    setError(null);
    try {
      await provider.resend(email);
    } catch {
      setError(SIGN_UP_ERROR_MESSAGE);
    }
  }

  return { step, email, isPending, error, signUp, resend };
}
