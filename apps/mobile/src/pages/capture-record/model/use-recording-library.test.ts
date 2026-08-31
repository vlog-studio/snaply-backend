import { act, renderHook } from '@testing-library/react-native';

import type { LocalRecording } from '@/shared/lib/recording-files';

import { useRecordingLibrary } from './use-recording-library';

const mockReloadRecordings = jest.fn().mockResolvedValue(undefined);
const mockClearListError = jest.fn();
const mockDeleteSnaps = jest.fn();
const mockClearDeleteError = jest.fn();

let mockRecordings: LocalRecording[] = [];
let mockListError: string | undefined;
let mockDeleteError: string | undefined;
let mockDeletingIds: string[] = [];

jest.mock('@/features/manage-recordings', () => ({
  useLocalRecordings: () => ({
    recordings: mockRecordings,
    isLoading: false,
    errorMessage: mockListError,
    clearError: mockClearListError,
    reloadRecordings: mockReloadRecordings,
  }),
}));

jest.mock('@/features/delete-snap', () => ({
  useDeleteSnaps: () => ({
    deleteSnaps: mockDeleteSnaps,
    deletingIds: mockDeletingIds,
    errorMessage: mockDeleteError,
    clearError: mockClearDeleteError,
  }),
}));

function createRecording(overrides: Partial<LocalRecording> = {}): LocalRecording {
  return {
    id: 'snaply-1.mp4',
    uri: 'file:///recordings/snaply-1.mp4',
    fileName: 'snaply-1.mp4',
    size: 1024,
    createdAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordings = [createRecording()];
  mockListError = undefined;
  mockDeleteError = undefined;
  mockDeletingIds = [];
  mockDeleteSnaps.mockResolvedValue(['snaply-1.mp4']);
});

describe('useRecordingLibrary', () => {
  it('opens and closes the library', async () => {
    const { result } = await renderHook(() => useRecordingLibrary());
    expect(result.current.isVisible).toBe(false);

    await act(async () => result.current.open());
    expect(result.current.isVisible).toBe(true);

    await act(async () => result.current.close());
    expect(result.current.isVisible).toBe(false);
  });

  it('selects a recording for preview and closes the library behind it', async () => {
    const recording = createRecording();
    const { result } = await renderHook(() => useRecordingLibrary());

    await act(async () => result.current.open());
    await act(async () => result.current.select(recording));

    expect(result.current.selected).toEqual(recording);
    expect(result.current.isVisible).toBe(false);

    await act(async () => result.current.clearSelection());
    expect(result.current.selected).toBeUndefined();
  });

  it('reloads the list after a delete and reports that the previewed recording is gone', async () => {
    const recording = createRecording();
    const { result } = await renderHook(() => useRecordingLibrary());
    await act(async () => result.current.select(recording));

    let removedSelected: boolean | undefined;
    await act(async () => {
      removedSelected = await result.current.remove(recording);
    });

    expect(mockDeleteSnaps).toHaveBeenCalledWith([recording]);
    expect(mockReloadRecordings).toHaveBeenCalledTimes(1);
    expect(removedSelected).toBe(true);
  });

  it('leaves the preview alone when another recording is deleted', async () => {
    const previewed = createRecording({ id: 'snaply-1.mp4' });
    const other = createRecording({ id: 'snaply-2.mp4' });
    mockDeleteSnaps.mockResolvedValue(['snaply-2.mp4']);
    const { result } = await renderHook(() => useRecordingLibrary());
    await act(async () => result.current.select(previewed));

    let removedSelected: boolean | undefined;
    await act(async () => {
      removedSelected = await result.current.remove(other);
    });

    expect(removedSelected).toBe(false);
    expect(result.current.selected).toEqual(previewed);
  });

  it('does not reload the list when nothing was deleted', async () => {
    mockDeleteSnaps.mockResolvedValue([]);
    const { result } = await renderHook(() => useRecordingLibrary());

    let removedSelected: boolean | undefined;
    await act(async () => {
      removedSelected = await result.current.remove(createRecording());
    });

    expect(mockReloadRecordings).not.toHaveBeenCalled();
    expect(removedSelected).toBe(false);
  });

  it('shows the list error first and falls back to the delete error', async () => {
    mockListError = '목록 오류';
    mockDeleteError = '삭제 오류';
    const { result } = await renderHook(() => useRecordingLibrary());
    expect(result.current.errorMessage).toBe('목록 오류');

    mockListError = undefined;
    const fallback = await renderHook(() => useRecordingLibrary());
    expect(fallback.result.current.errorMessage).toBe('삭제 오류');
  });

  it('clears both sources when the error is dismissed', async () => {
    const { result } = await renderHook(() => useRecordingLibrary());

    await act(async () => result.current.clearError());

    expect(mockClearListError).toHaveBeenCalledTimes(1);
    expect(mockClearDeleteError).toHaveBeenCalledTimes(1);
  });

  it('exposes the single recording currently being deleted', async () => {
    mockDeletingIds = ['snaply-1.mp4'];
    const { result } = await renderHook(() => useRecordingLibrary());

    expect(result.current.deletingId).toBe('snaply-1.mp4');
  });
});
