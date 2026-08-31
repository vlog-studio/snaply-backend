import { type CameraType, type CameraView } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';

const isRecordingSupported = process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android';

const CAMERA_MOUNT_FAILED = '카메라를 시작하지 못했어요.';

/**
 * What the capture state machine needs from the camera, and nothing else. The
 * machine is written against this contract instead of `expo-camera`, so it can
 * be exercised with a plain object and stays unaffected by the SDK's shape.
 */
export type RecordingDevice = {
  soundEnabled: boolean;
  /** Whether a recording may start right now (platform, mount, readiness). */
  canRecordNow: () => boolean;
  /** Record up to `maxDurationSec`, resolving with the file URI when there is one. */
  record: (maxDurationSec: number) => Promise<string | undefined>;
  stop: () => void;
};

/**
 * The camera device: its imperative handle, its readiness, and the two options
 * that ride on the preview (facing and sound). This is the only module in the
 * slice that calls `expo-camera`'s imperative API — the page renders
 * `<CameraView>` with these values and the capture session drives it through
 * `RecordingDevice`.
 *
 * The handle never leaves this file: the page attaches the view through
 * `attachCamera` rather than receiving the ref, so nothing above can reach into
 * the SDK object (and no consumer inherits a ref it must not read at render).
 */
export function useCameraDevice() {
  const cameraRef = useRef<CameraView | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  // A stable callback ref: `<CameraView ref={attachCamera} />` hands the view
  // in on mount and null on unmount, and never churns between renders.
  const attachCamera = useCallback((view: CameraView | null) => {
    cameraRef.current = view;
  }, []);

  const canRecordNow = () => isRecordingSupported && isReady && cameraRef.current !== null;

  const record = async (maxDurationSec: number): Promise<string | undefined> => {
    const result = await cameraRef.current?.recordAsync({ maxDuration: maxDurationSec });
    return result?.uri;
  };

  const stop = () => cameraRef.current?.stopRecording();

  const toggleSound = () => setSoundEnabled((current) => !current);

  const toggleFacing = () => {
    // iOS keeps the capture session alive across facing changes and never
    // re-emits onCameraReady; only Android recreates the camera and re-fires it.
    if (process.env.EXPO_OS === 'android') setIsReady(false);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  return {
    attachCamera,
    facing,
    soundEnabled,
    isReady,
    isRecordingSupported,
    errorMessage,
    canRecordNow,
    record,
    stop,
    toggleSound,
    toggleFacing,
    handleCameraReady: () => setIsReady(true),
    handleMountError: (message: string) => setErrorMessage(message || CAMERA_MOUNT_FAILED),
    /** The preview is about to be covered or replaced; it must re-announce itself. */
    markNotReady: () => setIsReady(false),
    clearError: () => setErrorMessage(undefined),
  };
}
