import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';

import { chunkedSecureStorage } from '@/shared/lib/secure-storage';

// EXPO_PUBLIC_* values are inlined at build time and are safe to ship: the anon
// key is a public client credential, gated server-side by Row Level Security.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when real Supabase credentials are supplied via env, i.e. the client is
 * talking to an actual project rather than the placeholder fallback below.
 * Callers use this to degrade gracefully when the backend is not wired up (e.g.
 * the sign-in flow falls back to a mock provider in development).
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. ' +
      'Real authentication will not work until they are provided in .env.',
  );
}

/**
 * The single Supabase client. It owns the auth session end to end: tokens are
 * persisted through the chunked SecureStore adapter, refreshed automatically
 * while the app is foregrounded, and never derived from a deep link (native
 * sign-in completes the PKCE exchange explicitly). Placeholder credentials keep
 * the app bootable for offline/mock development before a project is wired up.
 */
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: chunkedSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

/**
 * Bind Supabase's automatic token refresh to the app lifecycle: run it while
 * the app is active and stop it in the background, per Supabase's React Native
 * guidance. Returns an unsubscribe function.
 */
export function startAuthAutoRefresh(): () => void {
  const handleAppStateChange = (status: AppStateStatus): void => {
    if (status === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  handleAppStateChange(AppState.currentState);
  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription.remove();
}
