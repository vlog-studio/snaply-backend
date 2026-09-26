import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useVideoThumbnail } from './use-video-thumbnail';
import { getVideoThumbnail } from './video-thumbnails';

jest.mock('./video-thumbnails', () => ({
  getVideoThumbnail: jest.fn(),
}));

const getVideoThumbnailMock = getVideoThumbnail as jest.MockedFunction<typeof getVideoThumbnail>;

// The hook keeps a module-level index of resolved frames that deliberately
// survives across mounts (that is the behavior under test), so every test uses
// its own URIs instead of resetting shared state.
let uriSeq = 0;
function uniqueUri(): string {
  uriSeq += 1;
  return `file:///clips/clip-${uriSeq}.mp4`;
}

describe('useVideoThumbnail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the frame asynchronously on the first mount', async () => {
    const uri = uniqueUri();
    getVideoThumbnailMock.mockResolvedValue('file:///thumbs/a.jpg');

    const { result } = await renderHook(() => useVideoThumbnail(uri));

    await waitFor(() => expect(result.current).toBe('file:///thumbs/a.jpg'));
    expect(getVideoThumbnailMock).toHaveBeenCalledTimes(1);
  });

  it('returns an already-resolved frame synchronously on a remount, without re-extracting', async () => {
    const uri = uniqueUri();
    getVideoThumbnailMock.mockResolvedValue('file:///thumbs/b.jpg');

    const first = await renderHook(() => useVideoThumbnail(uri));
    await waitFor(() => expect(first.result.current).toBe('file:///thumbs/b.jpg'));
    await first.unmount();
    getVideoThumbnailMock.mockClear();

    const second = await renderHook(() => useVideoThumbnail(uri));

    // Known from the very first render — no blank placeholder frame.
    expect(second.result.current).toBe('file:///thumbs/b.jpg');
    expect(getVideoThumbnailMock).not.toHaveBeenCalled();
  });

  it('extracts once for consumers asking for the same video at the same time', async () => {
    const uri = uniqueUri();
    let release: (thumbnailUri: string) => void = () => {};
    getVideoThumbnailMock.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const first = await renderHook(() => useVideoThumbnail(uri));
    const second = await renderHook(() => useVideoThumbnail(uri));
    await act(async () => {
      release('file:///thumbs/shared.jpg');
    });

    await waitFor(() => expect(first.result.current).toBe('file:///thumbs/shared.jpg'));
    expect(second.result.current).toBe('file:///thumbs/shared.jpg');
    expect(getVideoThumbnailMock).toHaveBeenCalledTimes(1);
  });

  // A cut shown from its trim start needs that frame, and the clip's first
  // frame must not answer for it (or the other way round).
  it('keeps a frame sampled mid-clip apart from the first frame', async () => {
    const uri = uniqueUri();
    getVideoThumbnailMock.mockImplementation(async (_uri, options) =>
      options?.timeMs === undefined ? 'file:///thumbs/first.jpg' : 'file:///thumbs/at-1500.jpg',
    );

    const first = await renderHook(() => useVideoThumbnail(uri));
    const later = await renderHook(() => useVideoThumbnail(uri, 1500));

    await waitFor(() => expect(first.result.current).toBe('file:///thumbs/first.jpg'));
    await waitFor(() => expect(later.result.current).toBe('file:///thumbs/at-1500.jpg'));
    expect(getVideoThumbnailMock).toHaveBeenCalledWith(uri, undefined);
    expect(getVideoThumbnailMock).toHaveBeenCalledWith(uri, { timeMs: 1500 });
  });

  it('does not index a failed extraction, so the next mount retries it', async () => {
    const uri = uniqueUri();
    getVideoThumbnailMock.mockResolvedValueOnce(undefined);

    const first = await renderHook(() => useVideoThumbnail(uri));
    await waitFor(() => expect(getVideoThumbnailMock).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBeUndefined();
    await first.unmount();

    getVideoThumbnailMock.mockResolvedValueOnce('file:///thumbs/c.jpg');
    const second = await renderHook(() => useVideoThumbnail(uri));

    await waitFor(() => expect(second.result.current).toBe('file:///thumbs/c.jpg'));
    expect(getVideoThumbnailMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the placeholder while a swapped source is still resolving', async () => {
    const firstUri = uniqueUri();
    const secondUri = uniqueUri();
    getVideoThumbnailMock.mockResolvedValueOnce('file:///thumbs/d.jpg');
    // The swapped source resolves only when released below.
    let releaseSecond: (thumbnailUri: string) => void = () => {};
    getVideoThumbnailMock.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseSecond = resolve;
      }),
    );

    const { result, rerender } = await renderHook(
      ({ uri }: { uri: string }) => useVideoThumbnail(uri),
      { initialProps: { uri: firstUri } },
    );
    await waitFor(() => expect(result.current).toBe('file:///thumbs/d.jpg'));

    await rerender({ uri: secondUri });

    // Never reports the previous video's frame for the new source.
    expect(result.current).toBeUndefined();

    await act(async () => {
      releaseSecond('file:///thumbs/e.jpg');
    });
    await waitFor(() => expect(result.current).toBe('file:///thumbs/e.jpg'));
  });
});
