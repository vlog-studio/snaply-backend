import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { ApiError } from '@/shared/api';

import { useRestoreAccount } from './use-restore-account';

const mockClearPendingDeletion = jest.fn();

jest.mock('@/entities/session', () => ({
  clearPendingDeletion: () => mockClearPendingDeletion(),
  useCurrentUser: () => ({ id: 'user-a' }),
}));

const mockForgetDeletedAccount = jest.fn();

jest.mock('./deleted-account-ledger', () => ({
  forgetDeletedAccount: (userId: string) => mockForgetDeletedAccount(userId),
}));

const mockRestoreAccount = jest.fn();

jest.mock('../api/restore-account', () => ({
  restoreAccount: () => mockRestoreAccount(),
}));

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useRestoreAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockForgetDeletedAccount.mockResolvedValue(undefined);
  });

  it('releases the pending-deletion guard once the backend restores', async () => {
    mockRestoreAccount.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useRestoreAccount(), { wrapper });

    await act(async () => {
      await result.current.restoreAccount();
    });

    expect(mockRestoreAccount).toHaveBeenCalledTimes(1);
    expect(mockClearPendingDeletion).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('treats "not pending deletion" (400) as already restored', async () => {
    mockRestoreAccount.mockRejectedValue(
      new ApiError('BAD_REQUEST', '삭제 대기 중인 계정이 아닙니다.', { status: 400 }),
    );
    const { result } = await renderHook(() => useRestoreAccount(), { wrapper });

    await act(async () => {
      await result.current.restoreAccount();
    });

    expect(mockClearPendingDeletion).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('keeps the guard and surfaces an error on any other failure', async () => {
    mockRestoreAccount.mockRejectedValue(new ApiError('network_error', '네트워크 오류'));
    const { result } = await renderHook(() => useRestoreAccount(), { wrapper });

    await act(async () => {
      await result.current.restoreAccount();
    });

    expect(mockClearPendingDeletion).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });
});
