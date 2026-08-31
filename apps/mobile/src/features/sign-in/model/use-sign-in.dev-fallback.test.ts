import { act, renderHook } from '@testing-library/react-native';

import { useSignIn } from './use-sign-in';

const mockSetSession = jest.fn();

jest.mock('@/entities/session', () => ({
  useSetSession: () => mockSetSession,
}));

// Simulate a development build without Supabase credentials: `__DEV__` is true
// under the Jest preset, so an unconfigured client must select the mock provider.
jest.mock('@/shared/lib/supabase', () => ({ isSupabaseConfigured: false }));

const mockProviderSignIn = jest.fn();
jest.mock('./mock-auth-provider', () => ({
  mockAuthProvider: { signIn: (provider: string) => mockProviderSignIn(provider) },
}));

const mockSupabaseSignIn = jest.fn();
jest.mock('./supabase-auth-provider', () => ({
  SignInCancelledError: class SignInCancelledError extends Error {},
  supabaseAuthProvider: { signIn: (provider: string) => mockSupabaseSignIn(provider) },
}));

describe('useSignIn (development, Supabase unconfigured)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('signs in through the mock provider and never touches Supabase', async () => {
    mockProviderSignIn.mockResolvedValue({
      id: 'mock-google',
      displayName: 'Google 사용자',
      provider: 'google',
    });
    const { result } = await renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn('google');
    });

    expect(mockProviderSignIn).toHaveBeenCalledWith('google');
    expect(mockSupabaseSignIn).not.toHaveBeenCalled();
    expect(mockSetSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mock-google', provider: 'google' }),
    );
  });
});
