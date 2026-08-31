import { act, renderHook } from '@testing-library/react-native';

import { useExtractSnap } from './use-extract-snap';

const mockAddSnap = jest.fn();
jest.mock('@/entities/snap', () => ({
  useAddSnap: () => mockAddSnap,
}));

const mockTrimVideo = jest.fn();
jest.mock('@/shared/lib/video-trim', () => ({
  trimVideo: (...args: unknown[]) => mockTrimVideo(...args),
}));

const mockPersistLocalRecording = jest.fn();
jest.mock('@/shared/lib/recording-files', () => ({
  persistLocalRecording: (...args: unknown[]) => mockPersistLocalRecording(...args),
}));

const trimmed = {
  uri: 'file:///cache/video-trim/trim-abc.mp4',
  width: 1080,
  height: 1920,
  durationMs: 3000,
};

const recording = {
  id: 'snaply-1.mp4',
  uri: 'file:///documents/recordings/snaply-1.mp4',
  fileName: 'snaply-1.mp4',
  size: 10,
  createdAt: 1_700_000_000_000,
};

describe('useExtractSnap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrimVideo.mockResolvedValue(trimmed);
    mockPersistLocalRecording.mockResolvedValue(recording);
  });

  it('trims the window, persists the cut, and adds the snap', async () => {
    const { result } = await renderHook(() => useExtractSnap());

    let snap: unknown;
    await act(async () => {
      snap = await result.current.extractSnap('file:///cache/picked.mp4', 42.5, 45.5);
    });

    expect(mockTrimVideo).toHaveBeenCalledWith('file:///cache/picked.mp4', {
      startMs: 42_500,
      endMs: 45_500,
    });
    expect(mockPersistLocalRecording).toHaveBeenCalledWith(trimmed.uri);
    expect(mockAddSnap).toHaveBeenCalledTimes(1);
    expect(snap).toMatchObject({ id: recording.id, durationSec: 3 });
    expect(result.current.error).toBeNull();
  });

  it('clamps a window that drifted past the ceiling', async () => {
    const { result } = await renderHook(() => useExtractSnap());

    await act(async () => {
      await result.current.extractSnap('file:///cache/picked.mp4', 0, 5.1);
    });

    expect(mockTrimVideo).toHaveBeenCalledWith('file:///cache/picked.mp4', {
      startMs: 0,
      endMs: 5000,
    });
  });

  it('refuses a second extraction while the first trim is still in flight', async () => {
    let resolveTrim!: (value: typeof trimmed) => void;
    mockTrimVideo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTrim = resolve;
      }),
    );
    const { result } = await renderHook(() => useExtractSnap());

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = result.current.extractSnap('file:///cache/picked.mp4', 0, 3);
      second = result.current.extractSnap('file:///cache/picked.mp4', 1, 4);
      await Promise.resolve();
    });

    await expect(second).resolves.toBeNull();
    expect(mockTrimVideo).toHaveBeenCalledTimes(1);
    expect(result.current.isExtracting).toBe(true);

    await act(async () => {
      resolveTrim(trimmed);
      await first;
    });
    expect(mockPersistLocalRecording).toHaveBeenCalledTimes(1);
    expect(mockAddSnap).toHaveBeenCalledTimes(1);
    expect(result.current.isExtracting).toBe(false);
  });

  // A source shorter than the floor yields a whole-file window; stretching it
  // back out would ask the trimmer for footage past the file's end.
  it('does not stretch a window below the floor', async () => {
    const { result } = await renderHook(() => useExtractSnap());

    await act(async () => {
      await result.current.extractSnap('file:///cache/picked.mp4', 0, 0.3);
    });

    expect(mockTrimVideo).toHaveBeenCalledWith('file:///cache/picked.mp4', {
      startMs: 0,
      endMs: 300,
    });
  });

  it('refuses an inverted window without touching the trimmer', async () => {
    const { result } = await renderHook(() => useExtractSnap());

    let snap: unknown;
    await act(async () => {
      snap = await result.current.extractSnap('file:///cache/picked.mp4', 3, 3);
    });

    expect(snap).toBeNull();
    expect(mockTrimVideo).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error when the trim fails, and adds nothing', async () => {
    mockTrimVideo.mockRejectedValue(new Error('export failed'));
    const { result } = await renderHook(() => useExtractSnap());

    let snap: unknown;
    await act(async () => {
      snap = await result.current.extractSnap('file:///cache/picked.mp4', 0, 3);
    });

    expect(snap).toBeNull();
    expect(mockAddSnap).not.toHaveBeenCalled();
    expect(result.current.error).toBe('컷을 담지 못했어요. 다시 시도해 주세요.');
    expect(result.current.isExtracting).toBe(false);
  });

  it('surfaces an error when persisting the trimmed file fails, and adds nothing', async () => {
    mockPersistLocalRecording.mockRejectedValue(new Error('move failed'));
    const { result } = await renderHook(() => useExtractSnap());

    let snap: unknown;
    await act(async () => {
      snap = await result.current.extractSnap('file:///cache/picked.mp4', 0, 3);
    });

    expect(snap).toBeNull();
    expect(mockTrimVideo).toHaveBeenCalledTimes(1);
    expect(mockAddSnap).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
    expect(result.current.isExtracting).toBe(false);
  });

  it('clears the error on the next attempt', async () => {
    mockTrimVideo.mockRejectedValueOnce(new Error('export failed'));
    const { result } = await renderHook(() => useExtractSnap());

    await act(async () => {
      await result.current.extractSnap('file:///cache/picked.mp4', 0, 3);
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.extractSnap('file:///cache/picked.mp4', 0, 3);
    });
    expect(result.current.error).toBeNull();
    expect(mockAddSnap).toHaveBeenCalledTimes(1);
  });
});
