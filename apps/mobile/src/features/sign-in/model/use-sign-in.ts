import { useState } from 'react';

import { useSetSession, type SocialProvider } from '@/entities/session';
import { isSupabaseConfigured } from '@/shared/lib/supabase';

import type { AuthProvider } from './auth-provider';
import { mockAuthProvider } from './mock-auth-provider';
import { SignInCancelledError, supabaseAuthProvider } from './supabase-auth-provider';

const SIGN_IN_ERROR_MESSAGE = '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';

// Real authentication over Supabase Auth. In development builds without Supabase
// credentials, fall back to the offline mock provider so the sign-in flow can be
// exercised end to end instead of dead-ending on the placeholder host; any
// production build always uses Supabase.
const useMockAuth = __DEV__ && !isSupabaseConfigured;
const authProvider: AuthProvider = useMockAuth ? mockAuthProvider : supabaseAuthProvider;

if (useMockAuth) {
  console.warn('[sign-in] Supabase is not configured; using the offline mock auth provider.');
}

/**
 * Orchestrates the sign-in action: runs the provider, writes the resulting
 * user into the session store, and exposes the pending/error state a screen
 * needs. Navigation is handled declaratively by the root route guard once the
 * session becomes authenticated, so this hook does not navigate.
 */
export function useSignIn() {
  const setSession = useSetSession();
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: SocialProvider): Promise<void> {
    if (pendingProvider) return;
    setPendingProvider(provider);
    setError(null);
    try {
      const user = await authProvider.signIn(provider);
      setSession(user);
    } catch (cause) {
      // A user-cancelled browser dismissal is not a failure — stay silent.
      if (!(cause instanceof SignInCancelledError)) setError(SIGN_IN_ERROR_MESSAGE);
    } finally {
      setPendingProvider(null);
    }
  }

  return { signIn, pendingProvider, error };
}
