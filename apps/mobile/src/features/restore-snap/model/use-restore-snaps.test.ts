import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import {
  addSnapDeleteTombstone,
  clearSnapDeleteTombstone,
  getDeleteTombstones,
} from '@/entities/snap';
import { ApiError } from '@/shared/api';

import { useRestoreSnaps, type RestoreOutcome } from './use-restore-snaps';

jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

// The HTTP boundary. The sync store holding the unsent deletes runs for real.
const mockRestore = jest.fn<Promise<void>, [string]>();
jest.mock('../api/restore-server-snap', () => ({
  restoreServerSnap: (videoId: string) => mockRestore(videoId),
}));

async function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useRestoreSnaps(), { wrapper });
}

async function restore(
  result: { current: ReturnType<typeof useRestoreSnaps> },
  videoIds: string[],
): Promise<RestoreOutcome> {
  let outcome!: RestoreOutcome;
  await act(async () => {
    outcome = await result.current.restoreSnaps(videoIds);
  });
  return outcome;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const videoId of getDeleteTombstones()) clearSnapDeleteTombstone(videoId);
});

describe('useRestoreSnaps', () => {
  it('takes back a delete that has not gone out yet, even offline', async () => {
    addSnapDeleteTombstone('video-1');
    mockRestore.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline'));
    const { result } = await render();

    const outcome = await restore(result, ['video-1']);

    // The upload worker will never send the DELETE, so the server keeps the snap.
    expect(getDeleteTombstones()).not.toContain('video-1');
    expect(outcome).toEqual({ restored: ['video-1'], gone: [], failed: [] });
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('asks the server to bring back a delete that went out', async () => {
    mockRestore.mockResolvedValue();
    const { result } = await render();

    const outcome = await restore(result, ['video-2']);

    expect(mockRestore).toHaveBeenCalledWith('video-2');
    expect(outcome.restored).toEqual(['video-2']);
  });

  it('says a snap past its retention cannot come back', async () => {
    mockRestore.mockRejectedValue(new ApiError('NOT_RESTORABLE', 'gone', { status: 409 }));
    const { result } = await render();

    const outcome = await restore(result, ['video-3']);

    expect(outcome).toEqual({ restored: [], gone: ['video-3'], failed: [] });
    // 보관 기간이 끝나 되살릴 수 없어요.
    expect(result.current.errorMessage).toBe('보관 기간이 끝나 되살릴 수 없어요.');
  });

  it('keeps an unreached snap for another try and says so', async () => {
    mockRestore.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline'));
    const { result } = await render();

    const outcome = await restore(result, ['video-4']);

    expect(outcome).toEqual({ restored: [], gone: [], failed: ['video-4'] });
    // 되살리지 못했어요. 다시 시도해 주세요.
    expect(result.current.errorMessage).toBe('되살리지 못했어요. 다시 시도해 주세요.');
  });
});
