import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '@/shared/api';

import { FinishRefusalMessages, useFinishMovie } from './use-finish-movie';

const mockFinishRemote = jest.fn();
const mockRecordFinished = jest.fn();
jest.mock('@/entities/movie', () => ({
  finishRemoteMovie: (...args: unknown[]) => mockFinishRemote(...args),
  useFinishMovie: () => mockRecordFinished,
}));
jest.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFinishRemote.mockResolvedValue({ finishedAt: 1_754_000_000_000, resultDeleted: true });
});

describe('useFinishMovie', () => {
  // The server is asked first and the store follows its answer — a movie shown
  // as finished whose file the server still holds would be the wrong lie.
  it('asks the server, then records the finish with the time it gave', async () => {
    const { result } = await renderHook(() => useFinishMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.finish('m1');
    });

    expect(mockFinishRemote).toHaveBeenCalledWith('m1');
    expect(mockRecordFinished).toHaveBeenCalledWith('m1', 1_754_000_000_000);
    expect(outcome).toEqual({ finished: true });
    expect(result.current.errorMessage).toBeUndefined();
  });

  it.each([
    ['a run owns the movie', 409, 'generating'],
    ['the server has lost the movie', 404, 'gone'],
  ] as const)('changes nothing and says why when %s', async (_case, status, refused) => {
    mockFinishRemote.mockRejectedValue(new ApiError('refused', 'no', { status }));
    const { result } = await renderHook(() => useFinishMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.finish('m1');
    });

    expect(mockRecordFinished).not.toHaveBeenCalled();
    expect(outcome).toEqual({ finished: false, refused });
    expect(result.current.errorMessage).toBe(FinishRefusalMessages[refused]);
  });

  it('leaves the movie untouched when the request itself fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFinishRemote.mockRejectedValue(new ApiError('network_error', 'network'));
    const { result } = await renderHook(() => useFinishMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.finish('m1');
    });

    expect(mockRecordFinished).not.toHaveBeenCalled();
    expect(outcome).toEqual({ finished: false, refused: 'unreachable' });
    expect(result.current.busy).toBe(false);
    warnSpy.mockRestore();
  });
});
