import { act, renderHook } from '@testing-library/react-native';

import { EmailAlreadyRegisteredError } from './sign-up-provider';
import { useSignUpFlow } from './use-sign-up-flow';

jest.mock('@/shared/lib/supabase', () => ({ isSupabaseConfigured: true }));

const mockSignUp = jest.fn();
const mockResend = jest.fn();

jest.mock('./supabase-sign-up-provider', () => ({
  supabaseSignUpProvider: {
    signUp: (email: string, password: string) => mockSignUp(email, password),
    resend: (email: string) => mockResend(email),
  },
}));

describe('useSignUpFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('advances to the sent step when confirmation is required', async () => {
    mockSignUp.mockResolvedValue({ needsConfirmation: true });
    const { result } = await renderHook(() => useSignUpFlow());

    await act(async () => {
      await result.current.signUp('  me@example.com  ', 'password123');
    });

    expect(mockSignUp).toHaveBeenCalledWith('me@example.com', 'password123');
    expect(result.current.step).toBe('sent');
    expect(result.current.email).toBe('me@example.com');
    expect(result.current.error).toBeNull();
  });

  it('stays on the form when no confirmation is required', async () => {
    mockSignUp.mockResolvedValue({ needsConfirmation: false });
    const { result } = await renderHook(() => useSignUpFlow());

    await act(async () => {
      await result.current.signUp('me@example.com', 'password123');
    });

    expect(result.current.step).toBe('form');
  });

  it('surfaces a taken-email message and stays on the form', async () => {
    mockSignUp.mockRejectedValue(new EmailAlreadyRegisteredError());
    const { result } = await renderHook(() => useSignUpFlow());

    await act(async () => {
      await result.current.signUp('me@example.com', 'password123');
    });

    expect(result.current.step).toBe('form');
    expect(result.current.error).toContain('이미');
  });

  it('re-sends the confirmation email after reaching the sent step', async () => {
    mockSignUp.mockResolvedValue({ needsConfirmation: true });
    mockResend.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useSignUpFlow());

    await act(async () => {
      await result.current.signUp('me@example.com', 'password123');
    });
    await act(async () => {
      await result.current.resend();
    });

    expect(mockResend).toHaveBeenCalledWith('me@example.com');
  });
});
