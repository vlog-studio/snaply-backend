import { act, renderHook } from '@testing-library/react-native';

import {
  useDeleteTombstones,
  useRetryFailedUploads,
  useSnapSyncStatus,
  useSnapSyncStore,
} from './snap-sync-store';

// Mock the persistence backend so no native file system is touched.
jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('snap sync store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The store is a module-level singleton; reset it so tests stay independent.
    useSnapSyncStore.setState({ entries: {}, deleteTombstones: [], deleteAttempts: {} });
  });

  it('reports pending for a snap it has never heard of', async () => {
    const { result } = await renderHook(() => useSnapSyncStatus('snap-1'));
    expect(result.current).toBe('pending');
  });

  it('walks a snap through uploading to uploaded with its videoId', async () => {
    const { result } = await renderHook(() => useSnapSyncStatus('snap-1'));

    await act(async () => useSnapSyncStore.getState().markUploading('snap-1'));
    expect(result.current).toBe('uploading');

    await act(async () => useSnapSyncStore.getState().markUploaded('snap-1', 'video-1'));
    expect(result.current).toBe('uploaded');
    expect(useSnapSyncStore.getState().entries['snap-1']).toEqual({
      status: 'uploaded',
      videoId: 'video-1',
    });
  });

  it('counts attempts across repeated failures', async () => {
    const { markUploadFailed } = useSnapSyncStore.getState();

    await act(async () => markUploadFailed('snap-1'));
    await act(async () => markUploadFailed('snap-1'));

    expect(useSnapSyncStore.getState().entries['snap-1']).toEqual({
      status: 'failed',
      attempts: 2,
    });
  });

  it('requeues only the failed snaps on a manual retry', async () => {
    useSnapSyncStore.setState({
      entries: {
        'snap-1': { status: 'failed', attempts: 3 },
        'snap-2': { status: 'uploaded', videoId: 'video-2' },
      },
    });

    const { result } = await renderHook(() => useRetryFailedUploads());
    await act(async () => result.current());

    expect(useSnapSyncStore.getState().entries).toEqual({
      'snap-2': { status: 'uploaded', videoId: 'video-2' },
    });
  });

  describe('forgetSnaps', () => {
    it('turns an uploaded entry into a tombstone and drops the rest', async () => {
      useSnapSyncStore.setState({
        entries: {
          'snap-1': { status: 'uploaded', videoId: 'video-1' },
          'snap-2': { status: 'failed', attempts: 1 },
          'snap-3': { status: 'uploaded', videoId: 'video-3' },
        },
      });

      const { result } = await renderHook(() => useDeleteTombstones());
      await act(async () => useSnapSyncStore.getState().forgetSnaps(['snap-1', 'snap-2']));

      expect(result.current).toEqual(['video-1']);
      expect(useSnapSyncStore.getState().entries).toEqual({
        'snap-3': { status: 'uploaded', videoId: 'video-3' },
      });
    });

    it('does not duplicate a tombstone that is already owed', async () => {
      useSnapSyncStore.setState({
        entries: { 'snap-1': { status: 'uploaded', videoId: 'video-1' } },
        deleteTombstones: ['video-1'],
      });

      await act(async () => useSnapSyncStore.getState().forgetSnaps(['snap-1']));

      expect(useSnapSyncStore.getState().deleteTombstones).toEqual(['video-1']);
    });

    it.each([[[]], [['snap-unknown']]])('leaves the state untouched for %j', async (ids) => {
      useSnapSyncStore.setState({
        entries: { 'snap-1': { status: 'uploaded', videoId: 'video-1' } },
      });
      const before = useSnapSyncStore.getState().entries;

      await act(async () => useSnapSyncStore.getState().forgetSnaps(ids));

      expect(useSnapSyncStore.getState().entries).toBe(before);
      expect(useSnapSyncStore.getState().deleteTombstones).toEqual([]);
    });
  });

  it('adds and clears a tombstone', async () => {
    await act(async () => useSnapSyncStore.getState().addTombstone('video-9'));
    expect(useSnapSyncStore.getState().deleteTombstones).toEqual(['video-9']);

    await act(async () => useSnapSyncStore.getState().clearTombstone('video-9'));
    expect(useSnapSyncStore.getState().deleteTombstones).toEqual([]);
  });

  // The count is what lets the worker stop retrying a delete the server will
  // never accept; it must survive a restart, so it lives here rather than in
  // the worker's memory.
  it('counts the refusals of an owed delete and forgets them with the tombstone', async () => {
    await act(async () => useSnapSyncStore.getState().addTombstone('video-9'));

    await act(async () => useSnapSyncStore.getState().markDeleteFailed('video-9'));
    await act(async () => useSnapSyncStore.getState().markDeleteFailed('video-9'));
    expect(useSnapSyncStore.getState().deleteAttempts['video-9']).toBe(2);

    await act(async () => useSnapSyncStore.getState().clearTombstone('video-9'));
    expect(useSnapSyncStore.getState().deleteAttempts['video-9']).toBeUndefined();
  });

  // Every write here is a trigger for the upload worker: clearing a tombstone
  // that is not there must not kick a drain that finds nothing to do.
  it('leaves state untouched when clearing a tombstone it does not hold', async () => {
    const before = useSnapSyncStore.getState();

    await act(async () => useSnapSyncStore.getState().clearTombstone('video-never'));

    expect(useSnapSyncStore.getState().deleteTombstones).toBe(before.deleteTombstones);
    expect(useSnapSyncStore.getState().deleteAttempts).toBe(before.deleteAttempts);
  });

  // The partialize contract is the crash recovery: an `uploading` entry must
  // never reach disk, so a transfer the app died inside rehydrates as pending.
  it('persists uploaded and failed entries but never uploading ones', () => {
    useSnapSyncStore.setState({
      entries: {
        'snap-1': { status: 'uploading' },
        'snap-2': { status: 'uploaded', videoId: 'video-2' },
        'snap-3': { status: 'failed', attempts: 1 },
      },
      deleteTombstones: ['video-4'],
      deleteAttempts: { 'video-4': 2 },
    });

    const persisted = useSnapSyncStore.persist
      .getOptions()
      .partialize?.(useSnapSyncStore.getState());

    expect(persisted).toEqual({
      entries: {
        'snap-2': { status: 'uploaded', videoId: 'video-2' },
        'snap-3': { status: 'failed', attempts: 1 },
      },
      deleteTombstones: ['video-4'],
      deleteAttempts: { 'video-4': 2 },
    });
  });
});
