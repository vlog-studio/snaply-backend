import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useIsAuthenticated } from '@/entities/session';
import type { Snap, SnapSyncEntry } from '@/entities/snap';

import { deleteRemoteVideo } from '../api/delete-remote-video';
import { putRecordingFile } from '../api/put-recording-file';
import { registerVideo } from '../api/register-video';
import { requestUploadUrl } from '../api/request-upload-url';

import { useUploadWorker } from './use-upload-worker';

// The worker only asks the session one question; answer it directly.
jest.mock('@/entities/session', () => ({
  useIsAuthenticated: jest.fn().mockReturnValue(true),
}));

// Mock the snap entity at its Public API with a real (in-memory) zustand store,
// so the worker's reactive triggers — a snap appearing, a tombstone appearing,
// a manual retry — fire exactly as they do against the production stores.
jest.mock('@/entities/snap', () => {
  // Plain JS on purpose: the jest.mock hoist check runs before TypeScript is
  // stripped, so no type annotations may appear inside this factory.
  const { create } = jest.requireActual('zustand');
  const store = create(() => ({ snaps: [], entries: {}, tombstones: [], deleteAttempts: {} }));
  const setEntry = (id: string, entry: object) =>
    store.setState((state: { entries: object }) => ({
      entries: { ...state.entries, [id]: entry },
    }));
  return {
    __store: store,
    useSnaps: () => store((state: { snaps: object[] }) => state.snaps),
    useSnapsHydrated: () => true,
    useSnapSyncEntries: () => store((state: { entries: object }) => state.entries),
    useSnapSyncHydrated: () => true,
    useDeleteTombstones: () => store((state: { tombstones: string[] }) => state.tombstones),
    getSnaps: () => store.getState().snaps,
    getSnapSyncEntries: () => store.getState().entries,
    getDeleteTombstones: () => store.getState().tombstones,
    markSnapUploading: (id: string) => setEntry(id, { status: 'uploading' }),
    markSnapUploaded: (id: string, videoId: string) =>
      setEntry(id, { status: 'uploaded', videoId }),
    markSnapUploadFailed: (id: string) => {
      const previous = store.getState().entries[id];
      setEntry(id, {
        status: 'failed',
        attempts: previous?.status === 'failed' ? previous.attempts + 1 : 1,
      });
    },
    addSnapDeleteTombstone: (videoId: string) =>
      store.setState((state: { tombstones: string[] }) => ({
        tombstones: [...state.tombstones, videoId],
      })),
    clearSnapDeleteTombstone: (videoId: string) =>
      store.setState((state: { tombstones: string[]; deleteAttempts: Record<string, number> }) => {
        const { [videoId]: _dropped, ...deleteAttempts } = state.deleteAttempts;
        return {
          tombstones: state.tombstones.filter((id: string) => id !== videoId),
          deleteAttempts,
        };
      }),
    markSnapDeleteFailed: (videoId: string) => {
      const recorded = store.getState().deleteAttempts as Record<string, number>;
      const attempts = (recorded[videoId] ?? 0) + 1;
      store.setState((state: { deleteAttempts: Record<string, number> }) => ({
        deleteAttempts: { ...state.deleteAttempts, [videoId]: attempts },
      }));
      return attempts;
    },
  };
});

jest.mock('../api/request-upload-url', () => ({ requestUploadUrl: jest.fn() }));
jest.mock('../api/put-recording-file', () => ({ putRecordingFile: jest.fn() }));
jest.mock('../api/register-video', () => ({ registerVideo: jest.fn() }));
jest.mock('../api/delete-remote-video', () => ({ deleteRemoteVideo: jest.fn() }));

type FakeState = {
  snaps: Snap[];
  entries: Record<string, SnapSyncEntry>;
  tombstones: string[];
  deleteAttempts: Record<string, number>;
};

const snapEntityMock = jest.requireMock('@/entities/snap') as {
  __store: {
    getState: () => FakeState;
    setState: (partial: Partial<FakeState> | ((state: FakeState) => Partial<FakeState>)) => void;
  };
};
const fakeStore = snapEntityMock.__store;

const mockUseIsAuthenticated = useIsAuthenticated as jest.Mock;
const mockRequestUploadUrl = requestUploadUrl as jest.Mock;
const mockPutRecordingFile = putRecordingFile as jest.Mock;
const mockRegisterVideo = registerVideo as jest.Mock;
const mockDeleteRemoteVideo = deleteRemoteVideo as jest.Mock;

function makeSnap(overrides: Partial<Snap> = {}): Snap {
  return {
    id: 'snap-1',
    uri: 'file:///doc/recordings/snap-1.mp4',
    durationSec: 3.4,
    capturedAt: 1_753_200_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    ...overrides,
  };
}

describe('useUploadWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsAuthenticated.mockReturnValue(true);
    mockRequestUploadUrl.mockResolvedValue({
      videoId: 'video-1',
      uploadUrl: 'https://storage/upload-1',
    });
    mockPutRecordingFile.mockResolvedValue(undefined);
    mockRegisterVideo.mockResolvedValue(undefined);
    mockDeleteRemoteVideo.mockResolvedValue(undefined);
    fakeStore.setState({ snaps: [], entries: {}, tombstones: [], deleteAttempts: {} });
  });

  it('uploads a pending snap through all three steps and records the videoId', async () => {
    fakeStore.setState({ snaps: [makeSnap()] });

    await renderHook(() => useUploadWorker());

    await waitFor(() =>
      expect(fakeStore.getState().entries['snap-1']).toEqual({
        status: 'uploaded',
        videoId: 'video-1',
      }),
    );
    expect(mockRequestUploadUrl).toHaveBeenCalledWith('snap-1', 'video/mp4');
    expect(mockPutRecordingFile).toHaveBeenCalledWith(
      'https://storage/upload-1',
      'file:///doc/recordings/snap-1.mp4',
      'video/mp4',
    );
    // The measured 3.4s is rounded to the spec's integer seconds.
    expect(mockRegisterVideo).toHaveBeenCalledWith('video-1', 3);
  });

  it('uploads the oldest snap first', async () => {
    fakeStore.setState({
      snaps: [
        makeSnap({ id: 'newer', capturedAt: 200 }),
        makeSnap({ id: 'older', capturedAt: 100 }),
      ],
    });
    mockRequestUploadUrl
      .mockResolvedValueOnce({ videoId: 'video-older', uploadUrl: 'https://storage/a' })
      .mockResolvedValueOnce({ videoId: 'video-newer', uploadUrl: 'https://storage/b' });

    await renderHook(() => useUploadWorker());

    await waitFor(() => expect(mockRequestUploadUrl).toHaveBeenCalledTimes(2));
    expect(mockRequestUploadUrl.mock.calls.map(([filename]) => filename)).toEqual([
      'older',
      'newer',
    ]);
  });

  it('marks a snap failed when a step throws, and stops the pipeline there', async () => {
    fakeStore.setState({ snaps: [makeSnap()] });
    mockPutRecordingFile.mockRejectedValue(new Error('network down'));

    await renderHook(() => useUploadWorker());

    await waitFor(() =>
      expect(fakeStore.getState().entries['snap-1']).toEqual({ status: 'failed', attempts: 1 }),
    );
    expect(mockRegisterVideo).not.toHaveBeenCalled();
  });

  it('does nothing while signed out', async () => {
    mockUseIsAuthenticated.mockReturnValue(false);
    fakeStore.setState({ snaps: [makeSnap()] });

    await renderHook(() => useUploadWorker());

    // Give any wrongly-started work a tick to surface.
    await act(async () => {});
    expect(mockRequestUploadUrl).not.toHaveBeenCalled();
  });

  it('picks up a snap captured after mount', async () => {
    await renderHook(() => useUploadWorker());
    await act(async () => {});
    expect(mockRequestUploadUrl).not.toHaveBeenCalled();

    await act(async () => {
      fakeStore.setState((state) => ({ snaps: [...state.snaps, makeSnap()] }));
    });

    await waitFor(() =>
      expect(fakeStore.getState().entries['snap-1']).toMatchObject({ status: 'uploaded' }),
    );
  });

  it('drains delete tombstones and clears each one the server confirmed', async () => {
    fakeStore.setState({ tombstones: ['video-9', 'video-8'] });

    await renderHook(() => useUploadWorker());

    await waitFor(() => expect(fakeStore.getState().tombstones).toEqual([]));
    expect(mockDeleteRemoteVideo.mock.calls.map(([videoId]) => videoId)).toEqual([
      'video-9',
      'video-8',
    ]);
  });

  it('keeps a tombstone the server refused, to retry on a later trigger', async () => {
    fakeStore.setState({ tombstones: ['video-9'] });
    mockDeleteRemoteVideo.mockRejectedValue(new Error('offline'));

    await renderHook(() => useUploadWorker());

    await act(async () => {});
    expect(fakeStore.getState().tombstones).toEqual(['video-9']);
    expect(fakeStore.getState().deleteAttempts['video-9']).toBe(1);
  });

  // Without the backoff hold, the extra pass any other write queues walked
  // straight back into the delete that had just failed.
  it('does not retry a refused delete again in the same drain', async () => {
    fakeStore.setState({ snaps: [makeSnap()], tombstones: ['video-9'] });
    mockDeleteRemoteVideo.mockRejectedValue(new Error('offline'));

    await renderHook(() => useUploadWorker());

    // The upload's own writes queue a second pass; the tombstone must sit it out.
    await waitFor(() =>
      expect(fakeStore.getState().entries['snap-1']).toMatchObject({ status: 'uploaded' }),
    );
    await act(async () => {});
    expect(mockDeleteRemoteVideo).toHaveBeenCalledTimes(1);
  });

  // The regression: a delete the server would never accept was replayed at
  // every launch, forever, because nothing ever counted its failures.
  it('gives the tombstone up once its attempts run out', async () => {
    fakeStore.setState({ tombstones: ['video-9'], deleteAttempts: { 'video-9': 4 } });
    mockDeleteRemoteVideo.mockRejectedValue(new Error('gone for good'));

    await renderHook(() => useUploadWorker());

    await waitFor(() => expect(fakeStore.getState().tombstones).toEqual([]));
    expect(fakeStore.getState().deleteAttempts['video-9']).toBeUndefined();
    expect(mockDeleteRemoteVideo).toHaveBeenCalledTimes(1);
  });

  it('tombstones the remote copy when the snap is deleted mid-upload after registration', async () => {
    fakeStore.setState({ snaps: [makeSnap()] });
    // The user deletes the snap while the register step is in flight — the
    // library and the sync entry are already cleaned up when it resolves.
    mockRegisterVideo.mockImplementation(async () => {
      fakeStore.setState({ snaps: [], entries: {} });
    });

    await renderHook(() => useUploadWorker());

    await waitFor(() => expect(mockDeleteRemoteVideo).toHaveBeenCalledWith('video-1'));
    expect(fakeStore.getState().entries['snap-1']).toBeUndefined();
    await waitFor(() => expect(fakeStore.getState().tombstones).toEqual([]));
  });

  it('leaves an exhausted failed snap alone until a manual retry requeues it', async () => {
    fakeStore.setState({
      snaps: [makeSnap()],
      entries: { 'snap-1': { status: 'failed', attempts: 5 } },
    });

    await renderHook(() => useUploadWorker());

    await act(async () => {});
    expect(mockRequestUploadUrl).not.toHaveBeenCalled();

    // A manual "다시 시도" clears failed entries, which is all the requeue is.
    await act(async () => {
      fakeStore.setState({ entries: {} });
    });

    await waitFor(() =>
      expect(fakeStore.getState().entries['snap-1']).toMatchObject({ status: 'uploaded' }),
    );
  });
});
