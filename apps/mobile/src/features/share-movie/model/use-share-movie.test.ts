import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Movie } from '@/entities/movie';

import { useShareMovie, type ShareSource } from './use-share-movie';

const mockCanShare = jest.fn<Promise<boolean>, []>();
const mockShareFile = jest.fn<Promise<void>, [string, unknown]>();
const mockDownload = jest.fn<Promise<string>, [string, string]>();

jest.mock('@/shared/lib/sharing', () => ({
  canShareFiles: () => mockCanShare(),
  shareFile: (uri: string, options: unknown) => mockShareFile(uri, options),
}));
jest.mock('../api/download-render-file', () => ({
  downloadRenderFile: (uri: string, cacheKey: string) => mockDownload(uri, cacheKey),
}));

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'm1',
    title: '무비 08-03',
    status: 'ready',
    createdAt: 1_754_000_000_000,
    updatedAt: 1_754_000_000_000,
    snapRefs: [{ snapId: 's1', order: 0 }],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
    render: { videoId: 'result-1', renderedAt: 42, durationSec: 12 },
    ...overrides,
  };
}

const resolved = (uri: string | undefined): ShareSource => ({
  uri,
  resolving: false,
  unresolved: false,
});

/** The ask for the address failed and left nothing to play. */
const unresolved: ShareSource = { uri: undefined, resolving: false, unresolved: true };

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockCanShare.mockResolvedValue(true);
  mockShareFile.mockResolvedValue(undefined);
  mockDownload.mockImplementation((uri) => Promise.resolve(uri));
});

describe('useShareMovie', () => {
  it('downloads the render locally, then opens the share sheet on the local copy', async () => {
    mockDownload.mockResolvedValue('file:///cache/share-movie/m1-42.mp4');
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4?sig=abc')),
    );

    expect(result.current.blocked).toBeUndefined();
    await act(async () => result.current.share());

    // Keyed on the render version, not the URL — the signed URL changes on
    // every resolution while naming the same bytes.
    expect(mockDownload).toHaveBeenCalledWith('https://cdn/e.mp4?sig=abc', 'm1-42');
    expect(mockShareFile).toHaveBeenCalledWith(
      'file:///cache/share-movie/m1-42.mp4',
      expect.objectContaining({ mimeType: 'video/mp4', dialogTitle: '무비 08-03' }),
    );
  });

  it('blocks a movie whose source resolved to no file', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), resolved(undefined)));

    expect(result.current.blocked).toBe('no-render');
    await act(async () => result.current.share());

    expect(mockShareFile).not.toHaveBeenCalled();
  });

  // Same empty uri, opposite situations: a file that was never made, and one
  // whose address this device could not fetch. Only the second is a connection
  // problem, and saying "not made yet" about a finished movie is the worse lie.
  it('tells an unfetched address apart from a movie with no file', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), unresolved));

    expect(result.current.blocked).toBe('unresolved');
    await act(async () => result.current.share());

    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('is busy while the download runs, and done after', async () => {
    let releaseDownload = (_uri: string) => {};
    mockDownload.mockReturnValue(new Promise((resolve) => (releaseDownload = resolve)));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());
    expect(result.current.busy).toBe(true);

    // A second press while busy starts nothing — the guard is in the hook, not
    // only in a `disabled` prop.
    await act(async () => result.current.share());
    expect(mockDownload).toHaveBeenCalledTimes(1);

    await act(async () => releaseDownload('file:///cache/m.mp4'));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(mockShareFile).toHaveBeenCalledWith('file:///cache/m.mp4', expect.anything());
  });

  it('reports a failed download, and clears it when a new attempt starts', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(mockShareFile).not.toHaveBeenCalled();

    mockDownload.mockResolvedValueOnce('file:///cache/m.mp4');
    await act(async () => result.current.share());
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(mockShareFile).toHaveBeenCalled();
  });

  it('shares nothing on a platform with no share sheet', async () => {
    mockCanShare.mockResolvedValue(false);
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());

    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('survives a share sheet that throws', async () => {
    // The failure is warned about in dev; the warning is the expected output
    // here, not a test problem, so it is silenced rather than printed.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockShareFile.mockRejectedValue(new Error('cancelled'));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());

    expect(mockShareFile).toHaveBeenCalled();
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it('blocks when there is no movie at all', async () => {
    const { result } = await renderHook(() => useShareMovie(undefined, resolved(undefined)));

    expect(result.current.blocked).toBe('no-render');
  });
});
