import { act, renderHook } from '@testing-library/react-native';

import { EmailNotConfirmedError } from './email-auth-provider';
import { useEmailSignIn } from './use-email-sign-in';

const mockSetSession = jest.fn();

jest.mock('@/entities/session', () => ({
  useSetSession: () => mockSetSession,
}));

// Force the real-Supabase branch so these cases exercise the Supabase provider.
jest.mock('@/shared/lib/supabase', () => ({ isSupabaseConfigured: true }));

const mockSignIn = jest.fn();

jest.mock('./supabase-email-auth-provider', () => ({
  supabaseEmailAuthProvider: {
    signIn: (email: string, password: string) => mockSignIn(email, password),
  },
}));

describe('useEmailSignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trims the email, writes a session, and settles clean on success', async () => {
    mockSignIn.mockResolvedValue({
      id: 'user-1',
      displayName: 'me@example.com',
      provider: 'email',
    });
    const { result } = await renderHook(() => useEmailSignIn());

    await act(async () => {
      await result.current.signIn('  me@example.com  ', 'secret');
    });

    expect(mockSignIn).toHaveBeenCalledWith('me@example.com', 'secret');
    expect(mockSetSession).toHaveBeenCalledWith(expect.objectContaining({ provider: 'email' }));
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a distinct message when the email is not confirmed', async () => {
    mockSignIn.mockRejectedValue(new EmailNotConfirmedError());
    const { result } = await renderHook(() => useEmailSignIn());

    await act(async () => {
      await result.current.signIn('me@example.com', 'secret');
    });

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.current.error).toContain('인증');
  });

  it('surfaces a credentials error on failure', async () => {
    mockSignIn.mockRejectedValue(new Error('invalid'));
    const { result } = await renderHook(() => useEmailSignIn());

    await act(async () => {
      await result.current.signIn('me@example.com', 'wrong');
    });

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });
});
