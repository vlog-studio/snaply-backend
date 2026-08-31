import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

import { ApiError } from '@/shared/api';

import { abandonAdReward } from '../api/abandon-ad-reward';
import { getAdRewardStatus } from '../api/get-ad-reward-status';
import { startAdReward } from '../api/start-ad-reward';
import { mockRewardAdProvider } from './mock-reward-ad-provider';
import { useWatchRewardAd } from './use-watch-reward-ad';

jest.mock('../api/start-ad-reward');
jest.mock('../api/get-ad-reward-status');
jest.mock('../api/abandon-ad-reward');
jest.mock('./mock-reward-ad-provider', () => ({
  mockRewardAdProvider: { show: jest.fn() },
}));
// The tests run in mock-API mode, so the flow picks the mock provider; the
// AdMob one is stubbed anyway so no test can reach the native ad SDK.
jest.mock('./admob-reward-ad-provider', () => ({
  admobRewardAdProvider: { show: jest.fn().mockResolvedValue('unavailable') },
}));

const mockStart = startAdReward as jest.MockedFunction<typeof startAdReward>;
const mockStatus = getAdRewardStatus as jest.MockedFunction<typeof getAdRewardStatus>;
const mockShow = mockRewardAdProvider.show as jest.MockedFunction<typeof mockRewardAdProvider.show>;
const mockAbandon = abandonAdReward as jest.MockedFunction<typeof abandonAdReward>;

const session = {
  rewardId: 'reward-1',
  nonce: 'nonce-1',
  ssvUserId: 'user-1',
  rewardCredits: 20,
  expiresAt: new Date('2026-08-14T10:00:00.000Z'),
};

/** Comfortably past the hook's 7 polls at 1.5s, so the settle window closes. */
const SETTLE_WINDOW_MS = 20_000;

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    Wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useWatchRewardAd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAbandon.mockResolvedValue({ rewardId: 'reward-1', status: 'abandoned', balance: 120 });
  });

  it('grants after the ad earns and the server confirms, carrying the nonce to the ad', async () => {
    mockStart.mockResolvedValue(session);
    mockShow.mockResolvedValue('earned');
    mockStatus.mockResolvedValue({
      rewardId: 'reward-1',
      status: 'granted',
      credits: 20,
      balance: 140,
    });

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.watchAd();
    });

    expect(outcome).toEqual({ granted: true, credits: 20 });
    expect(mockShow).toHaveBeenCalledWith({ nonce: 'nonce-1', ssvUserId: 'user-1' });
  });

  it('reports a dismissed ad without ever polling for a grant', async () => {
    mockStart.mockResolvedValue(session);
    mockShow.mockResolvedValue('dismissed');

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.watchAd();
    });

    expect(outcome).toEqual({ granted: false, refused: 'dismissed' });
    expect(mockStatus).not.toHaveBeenCalled();
    // The slot goes back immediately; waiting out the session TTL would lock
    // the next ad out for as long as a successful one does.
    expect(mockAbandon).toHaveBeenCalledWith('reward-1');
  });

  it('maps the server refusal codes without showing an ad', async () => {
    mockStart.mockRejectedValue(
      new ApiError('AD_REWARD_LIMIT_REACHED', '오늘은 여기까지', { status: 409 }),
    );

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.watchAd();
    });

    expect(outcome).toEqual({ granted: false, refused: 'limit' });
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('settles a still-active previous session instead of refusing', async () => {
    mockStart.mockRejectedValue(
      new ApiError('AD_REWARD_SESSION_ACTIVE', '이전 보상 확인 중', {
        status: 409,
        details: { rewardId: 'reward-0' },
      }),
    );
    mockStatus.mockResolvedValue({
      rewardId: 'reward-0',
      status: 'granted',
      credits: 20,
      balance: 140,
    });

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.watchAd();
    });

    expect(outcome).toEqual({ granted: true, credits: 20 });
    expect(mockStatus).toHaveBeenCalledWith('reward-0');
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('keeps the slot when the ad earned, so a grant in flight is not disturbed', async () => {
    mockStart.mockResolvedValue(session);
    mockShow.mockResolvedValue('earned');
    mockStatus.mockResolvedValue({ rewardId: 'reward-1', status: 'pending', balance: 120 });

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    // The only test that runs the settle window to its end; on real timers that
    // is ~10s, which times the case out and takes the rest of the file with it.
    jest.useFakeTimers();
    let outcome;
    await act(async () => {
      const running = result.current.watchAd();
      await jest.advanceTimersByTimeAsync(SETTLE_WINDOW_MS);
      outcome = await running;
    });
    jest.useRealTimers();

    expect(outcome).toEqual({ granted: false, refused: 'pending' });
    expect(mockAbandon).not.toHaveBeenCalled();
  });

  it('still reports the ad outcome when releasing the slot fails', async () => {
    mockStart.mockResolvedValue(session);
    mockShow.mockResolvedValue('unavailable');
    mockAbandon.mockRejectedValue(new ApiError('network_error', '연결 실패'));

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.watchAd();
    });

    expect(outcome).toEqual({ granted: false, refused: 'unavailable' });
  });

  it('treats an abandoned session as settled rather than polling on', async () => {
    mockStart.mockResolvedValue(session);
    mockShow.mockResolvedValue('earned');
    mockStatus.mockResolvedValue({ rewardId: 'reward-1', status: 'abandoned', balance: 120 });

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.watchAd();
    });

    expect(outcome).toEqual({ granted: false, refused: 'unavailable' });
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('ends a settle the server rejected as unavailable, not pending', async () => {
    mockStart.mockResolvedValue(session);
    mockShow.mockResolvedValue('earned');
    mockStatus.mockResolvedValue({ rewardId: 'reward-1', status: 'rejected', balance: 120 });

    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useWatchRewardAd(), { wrapper: Wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.watchAd();
    });

    expect(outcome).toEqual({ granted: false, refused: 'unavailable' });
  });
});
