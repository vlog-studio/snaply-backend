import { act, renderHook } from '@testing-library/react-native';

import { useDeleteAccount } from './use-delete-account';

const mockClearSession = jest.fn();

jest.mock('@/entities/session', () => ({
  useClearSession: () => mockClearSession,
  useCurrentUser: () => ({ id: 'user-a' }),
}));

const mockRememberDeletedAccount = jest.fn();

jest.mock('./deleted-account-ledger', () => ({
  rememberDeletedAccount: (entry: unknown) => mockRememberDeletedAccount(entry),
}));

const mockDeleteAccount = jest.fn();

jest.mock('../api/delete-account', () => ({
  deleteAccount: () => mockDeleteAccount(),
}));

describe('useDeleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClearSession.mockResolvedValue(undefined);
    mockRememberDeletedAccount.mockResolvedValue(undefined);
  });

  it('soft-deletes on the backend and then ends the session', async () => {
    mockDeleteAccount.mockResolvedValue({ purgeAfter: new Date('2026-09-11') });
    const { result } = await renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearSession).toHaveBeenCalledTimes(1);
    // The local library is the account's only copy of its snaps, so the
    // deletion is scheduled for the end of the grace period, not performed now.
    expect(mockRememberDeletedAccount).toHaveBeenCalledWith({
      userId: 'user-a',
      purgeAfter: Date.parse('2026-09-11'),
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps the session and surfaces an error when the backend refuses', async () => {
    mockDeleteAccount.mockRejectedValue(new Error('subscription cancel failed'));
    const { result } = await renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(mockClearSession).not.toHaveBeenCalled();
    expect(mockRememberDeletedAccount).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it('clears the previous error on a retry', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error('boom'));
    mockDeleteAccount.mockResolvedValueOnce({ purgeAfter: new Date('2026-09-11') });
    const { result } = await renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.deleteAccount();
    });
    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(result.current.error).toBeNull();
    expect(mockClearSession).toHaveBeenCalledTimes(1);
  });
});
