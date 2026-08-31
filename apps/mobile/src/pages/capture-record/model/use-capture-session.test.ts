import { act, renderHook } from '@testing-library/react-native';

import { useCaptureSession } from './use-capture-session';
import type { RecordingDevice } from './use-camera-device';

const mockCaptureMoment = jest.fn();
const mockClearMomentError = jest.fn();

jest.mock('@/features/capture-moment', () => ({
  useCaptureMoment: () => ({
    captureMoment: mockCaptureMoment,
    isSaving: false,
    error: null,
    clearError: mockClearMomentError,
  }),
}));

// Haptics are device behavior, not a rule this hook owns.
jest.mock('@/shared/lib/haptics', () => ({
  impactFeedback: jest.fn(),
  selectionFeedback: jest.fn(),
  successFeedback: jest.fn(),
}));

const snap = { id: 'snap-1', uri: 'file:///recordings/snaply-1.mp4' };

/** A recording that stays open until the test resolves it, like a held shutter. */
function pendingRecording() {
  let resolveRecording: (uri: string | undefined) => void = () => {};
  const record = jest.fn(
    () =>
      new Promise<string | undefined>((resolve) => {
        resolveRecording = resolve;
      }),
  );
  return { record, finish: (uri?: string) => resolveRecording(uri) };
}

function createDevice(overrides: Partial<RecordingDevice> = {}): jest.Mocked<RecordingDevice> {
  return {
    soundEnabled: true,
    canRecordNow: jest.fn(() => true),
    record: jest.fn(async () => 'file:///tmp/clip.mov'),
    stop: jest.fn(),
    ...overrides,
  } as jest.Mocked<RecordingDevice>;
}

function renderSession(device: RecordingDevice, isMicrophoneGranted = true) {
  const ensureMicrophonePermission = jest.fn().mockResolvedValue(isMicrophoneGranted);
  return {
    ensureMicrophonePermission,
    rendered: renderHook(() => useCaptureSession({ device, ensureMicrophonePermission })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockCaptureMoment.mockResolvedValue(snap);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCaptureSession', () => {
  it('discards an accidental tap without saving anything', async () => {
    const { record, finish } = pendingRecording();
    const device = createDevice({ record });
    const { rendered } = renderSession(device);
    const { result } = await rendered;

    await act(async () => result.current.beginHold());
    // Released immediately: below the accidental-tap threshold.
    await act(async () => {
      result.current.endHold();
      finish('file:///tmp/clip.mov');
    });

    expect(device.stop).toHaveBeenCalledTimes(1);
    expect(mockCaptureMoment).not.toHaveBeenCalled();
    expect(result.current.stage).toBe('idle');
    expect(result.current.lastCollected).toBeUndefined();
  });

  it('saves a held capture and reports it once for the counter', async () => {
    const { record, finish } = pendingRecording();
    const { rendered } = renderSession(createDevice({ record }));
    const { result } = await rendered;

    await act(async () => result.current.beginHold());
    expect(result.current.stage).toBe('recording');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      result.current.endHold();
      finish('file:///tmp/clip.mov');
    });

    expect(record).toHaveBeenCalledWith(3);
    expect(mockCaptureMoment).toHaveBeenCalledWith('file:///tmp/clip.mov', { durationSec: 3 });
    expect(result.current.lastCollected).toEqual({ nonce: 1, uri: snap.uri });
    expect(result.current.stage).toBe('idle');
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('surfaces a message when the recording produced no file', async () => {
    const { record, finish } = pendingRecording();
    const { rendered } = renderSession(createDevice({ record }));
    const { result } = await rendered;

    await act(async () => result.current.beginHold());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      result.current.endHold();
      finish(undefined);
    });

    expect(mockCaptureMoment).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe('촬영 결과를 가져오지 못했어요. 다시 시도해 주세요.');
    expect(result.current.stage).toBe('idle');
  });

  it('surfaces a message when the camera fails mid-recording', async () => {
    const device = createDevice({ record: jest.fn().mockRejectedValue(new Error('camera lost')) });
    const { rendered } = renderSession(device);
    const { result } = await rendered;

    await act(async () => result.current.beginHold());

    expect(result.current.errorMessage).toBe(
      '촬영을 완료하지 못했어요. 카메라 상태를 확인하고 다시 시도해 주세요.',
    );
    expect(result.current.stage).toBe('idle');
  });

  it('returns to idle when the capture action could not save the snap', async () => {
    mockCaptureMoment.mockResolvedValue(null);
    const { record, finish } = pendingRecording();
    const { rendered } = renderSession(createDevice({ record }));
    const { result } = await rendered;

    await act(async () => result.current.beginHold());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      result.current.endHold();
      finish('file:///tmp/clip.mov');
    });

    expect(result.current.stage).toBe('idle');
    expect(result.current.lastCollected).toBeUndefined();
  });

  it('refuses to record with sound on when the microphone is denied', async () => {
    const device = createDevice();
    const { ensureMicrophonePermission, rendered } = renderSession(device, false);
    const { result } = await rendered;

    await act(async () => result.current.beginHold());

    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(device.record).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe(
      '소리와 함께 촬영하려면 마이크 권한이 필요해요. 소리를 끄면 무음으로 촬영할 수 있어요.',
    );
    expect(result.current.stage).toBe('idle');
  });

  it('never asks for the microphone when recording muted', async () => {
    const device = createDevice({ soundEnabled: false });
    const { ensureMicrophonePermission, rendered } = renderSession(device, false);
    const { result } = await rendered;

    await act(async () => result.current.beginHold());

    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(device.record).toHaveBeenCalledTimes(1);
  });

  it('does not start while the camera is unavailable', async () => {
    const device = createDevice({ canRecordNow: jest.fn(() => false) });
    const { rendered } = renderSession(device);
    const { result } = await rendered;

    await act(async () => result.current.beginHold());

    expect(device.record).not.toHaveBeenCalled();
    expect(result.current.stage).toBe('idle');
  });

  it('stops the camera and ignores the result once the screen is abandoned', async () => {
    const { record, finish } = pendingRecording();
    const device = createDevice({ record });
    const { rendered } = renderSession(device);
    const { result } = await rendered;

    await act(async () => result.current.beginHold());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      result.current.abort();
      finish('file:///tmp/clip.mov');
    });

    expect(device.stop).toHaveBeenCalledTimes(1);
    expect(mockCaptureMoment).not.toHaveBeenCalled();
    expect(result.current.lastCollected).toBeUndefined();
  });

  it('changes the duration only while idle', async () => {
    const { record } = pendingRecording();
    const { rendered } = renderSession(createDevice({ record }));
    const { result } = await rendered;

    await act(async () => result.current.selectDuration(5));
    expect(result.current.duration).toBe(5);
    expect(result.current.remaining).toBe(5);

    await act(async () => result.current.beginHold());
    expect(result.current.stage).toBe('recording');

    await act(async () => result.current.selectDuration(3));
    expect(result.current.duration).toBe(5);
  });
});
