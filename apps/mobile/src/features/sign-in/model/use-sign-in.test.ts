import { act, renderHook } from '@testing-library/react-native';

import { SignInCancelledError } from './supabase-auth-provider';
import { useSignIn } from './use-sign-in';

const mockSetSession = jest.fn();

jest.mock('@/entities/session', () => ({
  useSetSession: () => mockSetSession,
}));

// Force the real-Supabase branch so these cases exercise `supabaseAuthProvider`;
// the development mock fallback is covered in `use-sign-in.dev-fallback.test.ts`.
jest.mock('@/shared/lib/supabase', () => ({ isSupabaseConfigured: true }));

const mockSignIn = jest.fn();

jest.mock('./supabase-auth-provider', () => {
  class SignInCancelledError extends Error {}
  return {
    SignInCancelledError,
    supabaseAuthProvider: { signIn: (provider: string) => mockSignIn(provider) },
  };
});

describe('useSignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes a session for the chosen provider and settles without pending or error', async () => {
    mockSignIn.mockResolvedValue({ id: 'user-1', displayName: 'Google User', provider: 'google' });
    const { result } = await renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn('google');
    });

    expect(mockSetSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', provider: 'google' }),
    );
    expect(result.current.pendingProvider).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('stays silent and creates no session when the user cancels', async () => {
    mockSignIn.mockRejectedValue(new SignInCancelledError());
    const { result } = await renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn('google');
    });

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error message when sign-in fails', async () => {
    mockSignIn.mockRejectedValue(new Error('network down'));
    const { result } = await renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn('apple');
    });

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });
});
