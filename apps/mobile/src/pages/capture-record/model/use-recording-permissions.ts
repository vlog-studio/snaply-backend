import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

const PERMISSION_REQUEST_FAILED =
  '카메라와 마이크 권한을 요청하지 못했어요. 설정에서 권한을 확인해 주세요.';

/**
 * Camera + microphone permission acquisition for video recording, end to end:
 * the permission state itself, the one automatic request when something is
 * still missing, the manual retry behind the permission gate, and the deep link
 * into system settings after a hard denial.
 *
 * Consumers see booleans and Korean copy, never `expo-camera`'s permission
 * objects — the recording flow above only has to ask "may I use the mic?".
 */
export function useRecordingPermissions() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const hasRequestedOnce = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const requestMissingPermissions = useCallback(async () => {
    if (!cameraPermission?.granted && cameraPermission?.canAskAgain) {
      await requestCameraPermission();
    }
    if (!microphonePermission?.granted && microphonePermission?.canAskAgain) {
      await requestMicrophonePermission();
    }
  }, [
    cameraPermission,
    microphonePermission,
    requestCameraPermission,
    requestMicrophonePermission,
  ]);

  const requestPermissions = useCallback(() => {
    void requestMissingPermissions().catch(() => setErrorMessage(PERMISSION_REQUEST_FAILED));
  }, [requestMissingPermissions]);

  // Ask once, as soon as the permission state is known and something is
  // actually missing. A denial that can no longer be re-asked leaves the gate
  // screen's "open settings" path as the only way forward.
  useEffect(() => {
    if (!cameraPermission || !microphonePermission || hasRequestedOnce.current) return;

    const needsCameraPermission = !cameraPermission.granted && cameraPermission.canAskAgain;
    const needsMicrophonePermission =
      !microphonePermission.granted && microphonePermission.canAskAgain;
    if (!needsCameraPermission && !needsMicrophonePermission) return;

    hasRequestedOnce.current = true;
    requestPermissions();
  }, [cameraPermission, microphonePermission, requestPermissions]);

  /**
   * Make sure the microphone is usable, asking for it if it is not. Returns
   * whether recording with sound may proceed; the caller owns what to say when
   * it may not.
   */
  const ensureMicrophonePermission = useCallback(async (): Promise<boolean> => {
    if (microphonePermission?.granted) return true;
    const nextPermission = await requestMicrophonePermission();
    return nextPermission.granted;
  }, [microphonePermission, requestMicrophonePermission]);

  const openAppSettings = useCallback(() => void Linking.openSettings(), []);

  const message = cameraPermission
    ? '영상을 촬영하려면 카메라 접근 권한이 필요해요.'
    : '카메라 권한을 확인하고 있어요.';

  return {
    /** The camera gate: the screen shows the viewfinder only once this is true. */
    isCameraGranted: Boolean(cameraPermission?.granted),
    /** False until the permission state has been read; the gate stays neutral. */
    isPermissionReady: Boolean(cameraPermission),
    canAskAgain: Boolean(cameraPermission?.canAskAgain),
    message,
    errorMessage,
    requestPermissions,
    ensureMicrophonePermission,
    openAppSettings,
    clearError: () => setErrorMessage(undefined),
  };
}
