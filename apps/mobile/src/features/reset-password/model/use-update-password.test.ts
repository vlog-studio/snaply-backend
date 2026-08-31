import { act, renderHook } from '@testing-library/react-native';

import { useUpdatePassword } from './use-update-password';

const mockFinishRecovery = jest.fn();

jest.mock('@/entities/session', () => ({
  useFinishPasswordRecovery: () => mockFinishRecovery,
}));

jest.mock('@/shared/lib/supabase', () => ({ isSupabaseConfigured: true }));

const mockUpdate = jest.fn();

jest.mock('./supabase-reset-password-provider', () => ({
  supabaseResetPasswordProvider: {
    updatePassword: (password: string) => mockUpdate(password),
  },
}));

describe('useUpdatePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates the password and ends the recovery state on success', async () => {
    mockUpdate.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useUpdatePassword());

    await act(async () => {
      await result.current.updatePassword('newpassword');
    });

    expect(mockUpdate).toHaveBeenCalledWith('newpassword');
    expect(mockFinishRecovery).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error and keeps recovery active on failure', async () => {
    mockUpdate.mockRejectedValue(new Error('nope'));
    const { result } = await renderHook(() => useUpdatePassword());

    await act(async () => {
      await result.current.updatePassword('newpassword');
    });

    expect(mockFinishRecovery).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });
});
