import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

import { creditQueries } from '@/entities/credit';
import type { Movie } from '@/entities/movie';

import { useRunCreditRefresh } from './use-run-credit-refresh';

const mockMovies = jest.fn<Movie[], []>();

// The movie store is the input under test; the query client, the credit query
// factory, and the invalidation are all real.
jest.mock('@/entities/movie', () => ({
  useMovies: () => mockMovies(),
}));
jest.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

const startedAt = 1_754_000_000_000;

function movie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'm1',
    title: '무비', // 무비
    status: 'draft',
    createdAt: startedAt,
    updatedAt: startedAt,
    snapRefs: [{ snapId: 's1', order: 0 }],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
    ...overrides,
  };
}

function generating(id: string, jobId: string, progress = 0): Movie {
  return movie({ id, status: 'generating', job: { id: jobId, progress, startedAt } });
}

/**
 * A client holding a balance read nobody is observing — so an invalidation
 * marks it stale without firing a request, and the mark is what is asserted.
 */
function seededClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClient.setQueryData(creditQueries.balance().queryKey, { balance: 500, entries: [] });
  return {
    queryClient,
    isBalanceStale: () =>
      queryClient.getQueryState(creditQueries.balance().queryKey)?.isInvalidated ?? false,
    Wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useRunCreditRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMovies.mockReturnValue([]);
  });

  it('leaves the balance alone on mount, even with a run already in flight', async () => {
    mockMovies.mockReturnValue([generating('m1', 'job-1')]);
    const { Wrapper, isBalanceStale } = seededClient();

    await renderHook(() => useRunCreditRefresh(), { wrapper: Wrapper });

    expect(isBalanceStale()).toBe(false);
  });

  // The reported bug: a run reserved 100 credits and the 나 tab, mounted
  // throughout, kept reading the balance from before it.
  it('re-reads the balance when a run starts', async () => {
    mockMovies.mockReturnValue([movie()]);
    const { Wrapper, isBalanceStale } = seededClient();
    const { rerender } = await renderHook(() => useRunCreditRefresh(), { wrapper: Wrapper });

    mockMovies.mockReturnValue([generating('m1', 'job-1')]);
    await act(async () => rerender({}));

    expect(isBalanceStale()).toBe(true);
  });

  // A failed or canceled run is refunded server-side.
  it.each([
    ['fails', movie({ status: 'failed', error: 'x' })],
    ['is canceled', movie({ status: 'draft' })],
  ])('re-reads the balance when a run %s', async (_, ended) => {
    mockMovies.mockReturnValue([generating('m1', 'job-1')]);
    const { Wrapper, isBalanceStale } = seededClient();
    const { rerender } = await renderHook(() => useRunCreditRefresh(), { wrapper: Wrapper });

    mockMovies.mockReturnValue([ended]);
    await act(async () => rerender({}));

    expect(isBalanceStale()).toBe(true);
  });

  it('re-reads when one run replaces another, though the count stays the same', async () => {
    mockMovies.mockReturnValue([generating('m1', 'job-1'), movie({ id: 'm2' })]);
    const { Wrapper, isBalanceStale } = seededClient();
    const { rerender } = await renderHook(() => useRunCreditRefresh(), { wrapper: Wrapper });

    mockMovies.mockReturnValue([movie({ status: 'ready' }), generating('m2', 'job-2')]);
    await act(async () => rerender({}));

    expect(isBalanceStale()).toBe(true);
  });

  it('ignores progress reports and edits that leave the runs as they were', async () => {
    mockMovies.mockReturnValue([generating('m1', 'job-1'), movie({ id: 'm2' })]);
    const { Wrapper, isBalanceStale } = seededClient();
    const { rerender } = await renderHook(() => useRunCreditRefresh(), { wrapper: Wrapper });

    mockMovies.mockReturnValue([
      generating('m1', 'job-1', 60),
      movie({ id: 'm2', title: '새 이름' }), // 새 이름
    ]);
    await act(async () => rerender({}));

    expect(isBalanceStale()).toBe(false);
  });
});
