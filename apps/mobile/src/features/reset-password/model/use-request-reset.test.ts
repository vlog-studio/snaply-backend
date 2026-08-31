import { act, renderHook } from '@testing-library/react-native';

import { useRequestReset } from './use-request-reset';

jest.mock('@/shared/lib/supabase', () => ({ isSupabaseConfigured: true }));

const mockRequest = jest.fn();

jest.mock('./supabase-reset-password-provider', () => ({
  supabaseResetPasswordProvider: {
    requestReset: (email: string) => mockRequest(email),
  },
}));

describe('useRequestReset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trims the email, sends the link, and flips to the sent state', async () => {
    mockRequest.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useRequestReset());

    await act(async () => {
      await result.current.requestReset('  me@example.com  ');
    });

    expect(mockRequest).toHaveBeenCalledWith('me@example.com');
    expect(result.current.sent).toBe(true);
    expect(result.current.email).toBe('me@example.com');
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error and stays un-sent on failure', async () => {
    mockRequest.mockRejectedValue(new Error('network'));
    const { result } = await renderHook(() => useRequestReset());

    await act(async () => {
      await result.current.requestReset('me@example.com');
    });

    expect(result.current.sent).toBe(false);
    expect(result.current.error).not.toBeNull();
  });
});
