import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Snap } from './snap';
import { fetchSnapFile, useSnapFiles } from './snap-file';
import { useSnapSyncStore } from './snap-sync-store';

/**
 * The HTTP transport and the file system are the edges: the address comes from
 * `GET /videos/{id}`, and the download lands in a set of "files on disk".
 */
const mockApiRequest = jest.fn();
const mockDownload = jest.fn();
const mockOnDisk = new Set<string>();

jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false, API_BASE_URL: 'https://api.test' }));
jest.mock('@/shared/api', () => ({
  apiRequest: (path: string, options: unknown) => mockApiRequest(path, options),
  apiPath: (template: string, params: Record<string, string>) =>
    template.replace('{id}', params.id),
}));
jest.mock('@/shared/lib/recording-files', () => ({ deleteLocalRecording: jest.fn() }));
jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/shared/lib/server-snap-files', () => ({
  serverSnapFileExists: (uri: string) => mockOnDisk.has(uri),
  downloadServerSnapFile: (url: string, uri: string) => mockDownload(url, uri),
  isServerSnapFile: () => true,
  deleteServerSnapFile: jest.fn(),
}));

let seq = 0;
function serverSnap(): Snap {
  seq += 1;
  const id = `video-${seq}`;
  return {
    id,
    uri: `file:///cache/server-snaps/${id}.mp4`,
    origin: 'server',
    durationSec: 3,
    capturedAt: 1_000,
    width: 720,
    height: 1280,
    orientation: 'portrait',
  };
}

describe('snap files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnDisk.clear();
    useSnapSyncStore.setState({ entries: {}, deleteTombstones: [], deleteAttempts: {} });
    mockApiRequest.mockResolvedValue({
      playbackUrl: 'https://s3.test/rendition.mp4',
      originalUrls: [],
    });
    mockDownload.mockImplementation(async (_url: string, uri: string) => {
      mockOnDisk.add(uri);
    });
  });

  it('fetches the playable copy, once, however many ask', async () => {
    const snap = serverSnap();

    await Promise.all([fetchSnapFile(snap), fetchSnapFile(snap)]);

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith('https://s3.test/rendition.mp4', snap.uri);
  });

  it('falls back to the original when no playable copy was made', async () => {
    const snap = serverSnap();
    mockApiRequest.mockResolvedValue({
      playbackUrl: null,
      originalUrls: ['https://s3.test/o.mov'],
    });

    await fetchSnapFile(snap);

    expect(mockDownload).toHaveBeenCalledWith('https://s3.test/o.mov', snap.uri);
  });

  it('asks for the uploaded video of a snap deleted from this device only', async () => {
    // It keeps its file name as its id; the upload record names the server's video.
    const snap: Snap = { ...serverSnap(), id: 'snaply-1.mp4' };
    useSnapSyncStore.setState({
      entries: { 'snaply-1.mp4': { status: 'uploaded', videoId: 'video-77' } },
    });

    await fetchSnapFile(snap);

    expect(mockApiRequest).toHaveBeenCalledWith('/videos/video-77', expect.anything());
    expect(mockDownload).toHaveBeenCalledWith('https://s3.test/rendition.mp4', snap.uri);
  });

  it('never fetches a snap shot on this device', async () => {
    const { origin: _origin, ...own } = serverSnap();

    await fetchSnapFile(own);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('reports a fetch in progress, then nothing once the copy is here', async () => {
    const snap = serverSnap();
    const snaps = [snap];

    const { result } = await renderHook(() => useSnapFiles(snaps));

    await waitFor(() => expect(result.current.fetching).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(mockOnDisk.has(snap.uri)).toBe(true);
  });

  it('stays failed until retried, then fetches again', async () => {
    const snap = serverSnap();
    const snaps = [snap];
    mockDownload.mockRejectedValueOnce(new Error('network down'));

    const { result } = await renderHook(() => useSnapFiles(snaps));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(mockDownload).toHaveBeenCalledTimes(1);

    await act(async () => result.current.retry());

    await waitFor(() => expect(result.current.failed).toBe(false));
    await waitFor(() => expect(result.current.fetching).toBe(false));
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });
});
