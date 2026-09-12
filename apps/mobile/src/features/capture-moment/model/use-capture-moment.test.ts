import { act, renderHook } from '@testing-library/react-native';

import { useCaptureMoment } from './use-capture-moment';

const mockAddSnap = jest.fn();
const mockPersist = jest.fn();
const mockReadPlace = jest.fn();
const mockReadMetadata = jest.fn();

// Mock each dependency at its slice Public API so the test stays at the seam.
// The entity's pure rules (orientation, stand-in size) stay real: a snap built
// against recreated ones would prove nothing about the snap the app stores.
jest.mock('@/entities/snap', () => ({
  ...jest.requireActual('@/entities/snap'),
  useAddSnap: () => mockAddSnap,
}));
jest.mock('@/shared/lib/recording-files', () => ({
  persistLocalRecording: (uri: string) => mockPersist(uri),
}));
jest.mock('@/shared/lib/video-metadata', () => ({
  readVideoMetadata: (uri: string) => mockReadMetadata(uri),
}));
// Same-slice sibling: mocked at its own path, and covered by its own test.
jest.mock('../lib/read-capture-place', () => ({
  readCapturePlace: () => mockReadPlace(),
}));

const recording = {
  id: 'snaply-1.mp4',
  uri: 'file:///doc/recordings/snaply-1.mp4',
  fileName: 'snaply-1.mp4',
  size: 4096,
  createdAt: 1_753_200_000_000,
};

describe('useCaptureMoment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPersist.mockResolvedValue(recording);
    mockReadPlace.mockResolvedValue(undefined);
    mockReadMetadata.mockResolvedValue({});
  });

  it('persists the file and creates a snap, filing it into nothing', async () => {
    const { result } = await renderHook(() => useCaptureMoment());

    let snap: Awaited<ReturnType<typeof result.current.captureMoment>> = null;
    await act(async () => {
      snap = await result.current.captureMoment('file:///cache/snap.mov', { durationSec: 3 });
    });

    expect(mockPersist).toHaveBeenCalledWith('file:///cache/snap.mov');
    expect(mockAddSnap).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snaply-1.mp4', durationSec: 3 }),
    );
    expect(snap).toMatchObject({ id: 'snaply-1.mp4' });
    expect(result.current.error).toBeNull();
  });

  // A hold released early stops the recording before the requested length is up,
  // so the file is what the snap is measured by — the timeline draws the snap at
  // exactly this number.
  it('records the length read back from the persisted file, not the one asked for', async () => {
    mockReadMetadata.mockResolvedValue({ durationSec: 1.2 });
    const { result } = await renderHook(() => useCaptureMoment());

    await act(async () => {
      await result.current.captureMoment('file:///cache/snap.mov', { durationSec: 3 });
    });

    expect(mockReadMetadata).toHaveBeenCalledWith(recording.uri);
    expect(mockAddSnap).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 1.2, durationMeasured: true }),
    );
  });

  // The camera records 720p and a phone held sideways records landscape; the
  // snap is sized by what the file says, not by an upright stand-in.
  it('records the size read back from the persisted file, rotation applied', async () => {
    mockReadMetadata.mockResolvedValue({ durationSec: 1.2, width: 1280, height: 720 });
    const { result } = await renderHook(() => useCaptureMoment());

    await act(async () => {
      await result.current.captureMoment('file:///cache/snap.mov', { durationSec: 3 });
    });

    expect(mockAddSnap).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1280,
        height: 720,
        orientation: 'landscape',
        dimensionsMeasured: true,
      }),
    );
  });

  it('falls back to the requested length and the stand-in, unmeasured, when the file cannot be read', async () => {
    const { result } = await renderHook(() => useCaptureMoment());

    await act(async () => {
      await result.current.captureMoment('file:///cache/snap.mov', { durationSec: 5 });
    });

    expect(mockAddSnap).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 5, width: 1080, height: 1920 }),
    );
    expect(mockAddSnap.mock.calls[0][0]).not.toHaveProperty('durationMeasured');
    expect(mockAddSnap.mock.calls[0][0]).not.toHaveProperty('dimensionsMeasured');
  });

  it('tags the snap with where it was captured when a fix is available', async () => {
    mockReadPlace.mockResolvedValue({ latitude: 37.5445, longitude: 127.0557 });
    const { result } = await renderHook(() => useCaptureMoment());

    await act(async () => {
      await result.current.captureMoment('file:///cache/snap.mov', { durationSec: 3 });
    });

    expect(mockAddSnap).toHaveBeenCalledWith(
      expect.objectContaining({ place: { latitude: 37.5445, longitude: 127.0557 } }),
    );
  });

  it('files the snap with no place at all when there is no fix', async () => {
    const { result } = await renderHook(() => useCaptureMoment());

    await act(async () => {
      await result.current.captureMoment('file:///cache/snap.mov', { durationSec: 3 });
    });

    expect(mockAddSnap).toHaveBeenCalledTimes(1);
    expect(mockAddSnap.mock.calls[0][0]).not.toHaveProperty('place');
  });

  it('surfaces an error and skips the store write when persistence fails', async () => {
    mockPersist.mockRejectedValue(new Error('disk full'));
    const { result } = await renderHook(() => useCaptureMoment());

    let snap: Awaited<ReturnType<typeof result.current.captureMoment>> = { id: 'x' } as never;
    await act(async () => {
      snap = await result.current.captureMoment('file:///cache/snap.mov', { durationSec: 3 });
    });

    expect(snap).toBeNull();
    expect(mockAddSnap).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });
});
