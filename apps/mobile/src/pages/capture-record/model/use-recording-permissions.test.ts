import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useRecordingPermissions } from './use-recording-permissions';

type Permission = { granted: boolean; canAskAgain: boolean };

const mockRequestCameraPermission = jest.fn();
const mockRequestMicrophonePermission = jest.fn();

let mockCameraPermission: Permission | null = null;
let mockMicrophonePermission: Permission | null = null;

jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockCameraPermission, mockRequestCameraPermission],
  useMicrophonePermissions: () => [mockMicrophonePermission, mockRequestMicrophonePermission],
}));

const denied: Permission = { granted: false, canAskAgain: true };
const granted: Permission = { granted: true, canAskAgain: false };
const blocked: Permission = { granted: false, canAskAgain: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockCameraPermission = denied;
  mockMicrophonePermission = denied;
  mockRequestCameraPermission.mockResolvedValue(granted);
  mockRequestMicrophonePermission.mockResolvedValue(granted);
});

describe('useRecordingPermissions', () => {
  it('asks once for whatever is still missing, and not again on a re-render', async () => {
    const { rerender } = await renderHook(() => useRecordingPermissions());

    await waitFor(() => expect(mockRequestCameraPermission).toHaveBeenCalledTimes(1));
    expect(mockRequestMicrophonePermission).toHaveBeenCalledTimes(1);

    await act(async () => rerender({}));

    expect(mockRequestCameraPermission).toHaveBeenCalledTimes(1);
    expect(mockRequestMicrophonePermission).toHaveBeenCalledTimes(1);
  });

  it('does not ask when the permission state is not known yet', async () => {
    mockCameraPermission = null;
    mockMicrophonePermission = null;

    await renderHook(() => useRecordingPermissions());

    expect(mockRequestCameraPermission).not.toHaveBeenCalled();
  });

  it('does not ask again once the system refuses to prompt', async () => {
    mockCameraPermission = blocked;
    mockMicrophonePermission = blocked;

    const { result } = await renderHook(() => useRecordingPermissions());

    expect(mockRequestCameraPermission).not.toHaveBeenCalled();
    expect(result.current.canAskAgain).toBe(false);
  });

  it('surfaces a Korean message when the request itself fails', async () => {
    mockRequestCameraPermission.mockRejectedValue(new Error('no prompt'));

    const { result } = await renderHook(() => useRecordingPermissions());

    await waitFor(() =>
      expect(result.current.errorMessage).toBe(
        '카메라와 마이크 권한을 요청하지 못했어요. 설정에서 권한을 확인해 주세요.',
      ),
    );

    await act(async () => result.current.clearError());
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('reports the camera gate once the permission is granted', async () => {
    mockCameraPermission = granted;
    mockMicrophonePermission = granted;

    const { result } = await renderHook(() => useRecordingPermissions());

    expect(result.current.isCameraGranted).toBe(true);
    expect(result.current.isPermissionReady).toBe(true);
    expect(result.current.message).toBe('영상을 촬영하려면 카메라 접근 권한이 필요해요.');
  });

  it('skips the microphone prompt when it is already granted', async () => {
    mockCameraPermission = granted;
    mockMicrophonePermission = granted;
    const { result } = await renderHook(() => useRecordingPermissions());

    let isGranted: boolean | undefined;
    await act(async () => {
      isGranted = await result.current.ensureMicrophonePermission();
    });

    expect(isGranted).toBe(true);
    expect(mockRequestMicrophonePermission).not.toHaveBeenCalled();
  });

  it('asks for the microphone and reports a refusal', async () => {
    mockCameraPermission = granted;
    mockMicrophonePermission = denied;
    mockRequestMicrophonePermission.mockResolvedValue(blocked);
    const { result } = await renderHook(() => useRecordingPermissions());

    let isGranted: boolean | undefined;
    await act(async () => {
      isGranted = await result.current.ensureMicrophonePermission();
    });

    expect(isGranted).toBe(false);
  });
});
