import { act, renderHook, waitFor } from '@testing-library/react-native';

import { readVideoDuration } from '@/shared/lib/video-duration';

import { useSourceDuration } from './use-source-duration';

jest.mock('@/shared/lib/video-duration', () => ({ readVideoDuration: jest.fn() }));

const mockReadVideoDuration = readVideoDuration as jest.MockedFunction<typeof readVideoDuration>;

describe('useSourceDuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a valid picker duration without opening a player', async () => {
    const { result } = await renderHook(() => useSourceDuration('file:///picked.mp4', 12.5));

    expect(result.current).toEqual({
      durationSec: 12.5,
      isReading: false,
      isUnreadable: false,
    });
    expect(mockReadVideoDuration).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'reads the file when the picker duration is %s',
    async (knownDurationSec) => {
      mockReadVideoDuration.mockResolvedValue(4.2);

      const { result } = await renderHook(() =>
        useSourceDuration('file:///picked.mp4', knownDurationSec),
      );

      await waitFor(() => expect(result.current.durationSec).toBe(4.2));
      expect(mockReadVideoDuration).toHaveBeenCalledWith('file:///picked.mp4');
      expect(result.current).toEqual({
        durationSec: 4.2,
        isReading: false,
        isUnreadable: false,
      });
    },
  );

  it('marks a source unreadable when the platform cannot measure it', async () => {
    mockReadVideoDuration.mockResolvedValue(undefined);

    const { result } = await renderHook(() => useSourceDuration('file:///broken.mp4', undefined));

    await waitFor(() => expect(result.current.isUnreadable).toBe(true));
    expect(result.current.durationSec).toBeUndefined();
    expect(result.current.isReading).toBe(false);
  });

  it('never reports a late duration from the previous source', async () => {
    let resolveFirst!: (duration: number | undefined) => void;
    let resolveSecond!: (duration: number | undefined) => void;
    mockReadVideoDuration
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const { result, rerender } = await renderHook(
      ({ sourceUri }: { sourceUri: string }) => useSourceDuration(sourceUri, undefined),
      { initialProps: { sourceUri: 'file:///first.mp4' } },
    );

    await rerender({ sourceUri: 'file:///second.mp4' });
    await act(async () => resolveFirst(9));
    expect(result.current).toEqual({
      durationSec: undefined,
      isReading: true,
      isUnreadable: false,
    });

    await act(async () => resolveSecond(3));
    await waitFor(() => expect(result.current.durationSec).toBe(3));
  });
});
