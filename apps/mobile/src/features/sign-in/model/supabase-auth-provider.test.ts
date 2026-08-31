import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/shared/lib/supabase';

import { SignInCancelledError, supabaseAuthProvider } from './supabase-auth-provider';

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'snaplyapp://auth/callback',
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ parse: jest.fn() }));
jest.mock('@/entities/session', () => ({
  mapSupabaseUser: (user: { id: string; app_metadata: { provider: string } }) => ({
    id: user.id,
    provider: user.app_metadata.provider,
    displayName: 'Mapped User',
  }),
}));
jest.mock('@/shared/lib/supabase', () => ({
  getAuthCallbackUrl: () => 'snaplyapp://auth/callback',
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
  },
}));

const signInWithOAuth = supabase.auth.signInWithOAuth as jest.Mock;
const exchangeCodeForSession = supabase.auth.exchangeCodeForSession as jest.Mock;
const openAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const parse = Linking.parse as jest.Mock;

describe('supabaseAuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('completes the PKCE flow and returns the mapped user', async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google/auth' },
      error: null,
    });
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'snaplyapp://auth/callback?code=auth-code',
    });
    parse.mockReturnValue({ queryParams: { code: 'auth-code' } });
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1', app_metadata: { provider: 'google' } } } },
      error: null,
    });

    const user = await supabaseAuthProvider.signIn('google');

    expect(exchangeCodeForSession).toHaveBeenCalledWith('auth-code');
    expect(user).toEqual(expect.objectContaining({ id: 'user-1', provider: 'google' }));
  });

  it('throws SignInCancelledError when the user dismisses the browser', async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google/auth' },
      error: null,
    });
    openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(supabaseAuthProvider.signIn('google')).rejects.toBeInstanceOf(
      SignInCancelledError,
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('propagates a provider error from signInWithOAuth', async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: new Error('provider unavailable') });

    await expect(supabaseAuthProvider.signIn('apple')).rejects.toThrow('provider unavailable');
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });
});
