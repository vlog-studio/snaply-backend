import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { mapSupabaseUser } from '@/entities/session';
import { getAuthCallbackUrl, supabase } from '@/shared/lib/supabase';

import type { AuthProvider } from './auth-provider';

/** Thrown when the user dismisses the OAuth browser without completing sign-in. */
export class SignInCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled by the user.');
    this.name = 'SignInCancelledError';
  }
}

/**
 * Real authentication over Supabase Auth using the PKCE OAuth flow:
 * `signInWithOAuth` yields a provider consent URL, an in-app browser session
 * runs the consent, and the returned authorization code is exchanged for a
 * session. Supabase persists and owns that session; the store's auth listener
 * mirrors the resulting user. Only Google and Apple are configured.
 */
export const supabaseAuthProvider: AuthProvider = {
  async signIn(provider) {
    // Deep link Supabase redirects back to after the provider consent screen
    // (shared with the email-confirmation flow; in the redirect allowlist).
    const redirectTo = getAuthCallbackUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) throw new Error('Supabase did not return an OAuth URL.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new SignInCancelledError();
    }
    if (result.type !== 'success') {
      throw new Error('The OAuth session did not complete.');
    }

    const { queryParams } = Linking.parse(result.url);
    const code = queryParams?.code;
    if (typeof code !== 'string') {
      throw new Error('The OAuth redirect did not include an authorization code.');
    }

    const { data: exchanged, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    if (!exchanged.session) throw new Error('Failed to exchange the code for a session.');

    return mapSupabaseUser(exchanged.session.user);
  },
};
