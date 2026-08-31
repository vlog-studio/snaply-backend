import { useRouter } from 'expo-router';

import type { LocalRecording } from '@/shared/lib/recording-files';

import { useCameraDevice } from './use-camera-device';
import { useCaptureSession, type RecordingStage } from './use-capture-session';
import { useRecordingLibrary } from './use-recording-library';
import { useRecordingPermissions } from './use-recording-permissions';

/** What the screen is showing: a capture run, or a saved recording being reviewed. */
type CaptureStage = RecordingStage | 'review';

/**
 * Composes the capture screen out of its four concerns — permissions, the
 * camera device, one capture run, and the saved-recording library — and owns
 * only what genuinely spans them: the screen's stage, its single error banner,
 * and the flows that touch more than one concern (leaving, retaking, opening
 * the library, previewing and deleting a recording).
 *
 * The page consumes this and renders; each concern is reached through its own
 * focused group, so a change to one of them stops at its own file.
 */
export function useCaptureRecorder() {
  const router = useRouter();

  const permissions = useRecordingPermissions();
  const library = useRecordingLibrary();
  const camera = useCameraDevice();

  const clearSurroundingErrors = () => {
    camera.clearError();
    permissions.clearError();
    library.clearError();
  };

  const session = useCaptureSession({
    device: camera,
    ensureMicrophonePermission: permissions.ensureMicrophonePermission,
    onCaptureStart: clearSurroundingErrors,
  });

  // Reviewing is "a saved recording is selected"; capture never enters it.
  const stage: CaptureStage = library.selected ? 'review' : session.stage;

  const dismissErrors = () => {
    clearSurroundingErrors();
    session.clearError();
  };

  const retake = () => {
    library.clearSelection();
    camera.markNotReady();
    session.reset();
    dismissErrors();
  };

  const closePage = () => {
    // Explicit leave: always go to the studio (not the tab that opened capture)
    // so the user lands where the next step is.
    session.abort();
    router.dismissAll();
    router.navigate('/');
  };

  const openLibrary = () => {
    // The preview is about to be covered, so it must re-announce readiness.
    if (stage === 'idle') camera.markNotReady();
    library.open();
  };

  const selectRecording = (recording: LocalRecording) => {
    library.select(recording);
    dismissErrors();
  };

  const deleteRecording = async (recording: LocalRecording) => {
    const removedSelected = await library.remove(recording);
    if (removedSelected) retake();
  };

  return {
    stage,
    showCamera: stage !== 'review' && !library.isVisible,
    // One banner, one message. Only one of these is ever set in practice; the
    // order states which wins if that ever stops being true.
    errorMessage:
      camera.errorMessage ??
      permissions.errorMessage ??
      session.errorMessage ??
      library.errorMessage,
    dismissErrors,
    closePage,
    retake,
    openLibrary,
    selectRecording,
    deleteRecording,
    permissions,
    camera,
    session,
    library,
  };
}
