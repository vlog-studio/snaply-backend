import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getVideoThumbnail } from '@/shared/lib/video-thumbnails';

import type { StripTile } from './extract-strip-layout';
import { useStripThumbnails } from './use-strip-thumbnails';

jest.mock('@/shared/lib/video-thumbnails', () => ({ getVideoThumbnail: jest.fn() }));

const mockGetVideoThumbnail = getVideoThumbnail as jest.MockedFunction<typeof getVideoThumbnail>;
const tiles: StripTile[] = [
  { timeMs: 200, widthPx: 60 },
  { timeMs: 1200, widthPx: 60 },
  { timeMs: 2200, widthPx: 30 },
];

describe('useStripThumbnails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts frames strictly one at a time and fills the strip from left to right', async () => {
    const resolvers: ((uri: string | undefined) => void)[] = [];
    mockGetVideoThumbnail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result } = await renderHook(() => useStripThumbnails('file:///source.mp4', tiles));

    await waitFor(() => expect(mockGetVideoThumbnail).toHaveBeenCalledTimes(1));
    expect(mockGetVideoThumbnail).toHaveBeenLastCalledWith('file:///source.mp4', { timeMs: 200 });

    await act(async () => resolvers[0]('file:///frame-1.jpg'));
    await waitFor(() => expect(mockGetVideoThumbnail).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual(['file:///frame-1.jpg']);

    await act(async () => resolvers[1]('file:///frame-2.jpg'));
    await waitFor(() => expect(mockGetVideoThumbnail).toHaveBeenCalledTimes(3));
    expect(result.current).toEqual(['file:///frame-1.jpg', 'file:///frame-2.jpg']);

    await act(async () => resolvers[2]('file:///frame-3.jpg'));
    await waitFor(() => expect(result.current).toHaveLength(3));
  });

  it('keeps a failed frame as a placeholder and continues with later tiles', async () => {
    mockGetVideoThumbnail
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('file:///frame-2.jpg')
      .mockResolvedValueOnce('file:///frame-3.jpg');

    const { result } = await renderHook(() => useStripThumbnails('file:///source.mp4', tiles));

    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current).toEqual([undefined, 'file:///frame-2.jpg', 'file:///frame-3.jpg']);
  });

  it('drops a late frame from the previous source', async () => {
    let resolveFirst!: (uri: string | undefined) => void;
    let resolveSecond!: (uri: string | undefined) => void;
    mockGetVideoThumbnail
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
    const oneTile = [tiles[0]];
    const { result, rerender } = await renderHook(
      ({ sourceUri }: { sourceUri: string }) => useStripThumbnails(sourceUri, oneTile),
      { initialProps: { sourceUri: 'file:///first.mp4' } },
    );
    await waitFor(() => expect(mockGetVideoThumbnail).toHaveBeenCalledTimes(1));

    await rerender({ sourceUri: 'file:///second.mp4' });
    await waitFor(() => expect(mockGetVideoThumbnail).toHaveBeenCalledTimes(2));
    await act(async () => resolveFirst('file:///stale.jpg'));
    expect(result.current).toEqual([]);

    await act(async () => resolveSecond('file:///current.jpg'));
    await waitFor(() => expect(result.current).toEqual(['file:///current.jpg']));
  });

  it('does not start another extraction after unmount', async () => {
    let resolveFirst!: (uri: string | undefined) => void;
    mockGetVideoThumbnail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const { unmount } = await renderHook(() => useStripThumbnails('file:///source.mp4', tiles));
    await waitFor(() => expect(mockGetVideoThumbnail).toHaveBeenCalledTimes(1));

    await unmount();
    await act(async () => resolveFirst('file:///late.jpg'));

    expect(mockGetVideoThumbnail).toHaveBeenCalledTimes(1);
  });
});
