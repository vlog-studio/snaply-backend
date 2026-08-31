import { useEffect, useRef, useState } from 'react';

import { normalizeCaptureDuration, type CaptureDuration } from '@/entities/capture-session';
import { useCaptureMoment } from '@/features/capture-moment';
import { impactFeedback, selectionFeedback, successFeedback } from '@/shared/lib/haptics';

import { shouldCollectHold } from './hold-gesture';
import type { RecordingDevice } from './use-camera-device';

/** Where a capture run is: nothing held, the camera rolling, or the file landing. */
export type RecordingStage = 'idle' | 'recording' | 'saving';

const MICROPHONE_REQUIRED =
  '소리와 함께 촬영하려면 마이크 권한이 필요해요. 소리를 끄면 무음으로 촬영할 수 있어요.';
const CAPTURE_RESULT_MISSING = '촬영 결과를 가져오지 못했어요. 다시 시도해 주세요.';
const CAPTURE_FAILED = '촬영을 완료하지 못했어요. 카메라 상태를 확인하고 다시 시도해 주세요.';

type CaptureSessionInput = {
  device: RecordingDevice;
  /** Returns whether recording with sound may proceed. */
  ensureMicrophonePermission: () => Promise<boolean>;
  /** A capture actually began: the screen clears whatever else it was showing. */
  onCaptureStart?: () => void;
};

/**
 * One capture run, start to finish: the press-and-hold gesture, the stage
 * machine, the display countdown, the selected duration, and handing the
 * resulting file to the capture action. It reaches the camera only through
 * `RecordingDevice` and the microphone only through the permission callback, so
 * this file holds the capture *rules* and no SDK details.
 *
 * The duration is a capture option rather than screen state: it can only be
 * tuned while idle, and each run commits the value shown when the hold began.
 */
export function useCaptureSession({
  device,
  ensureMicrophonePermission,
  onCaptureStart,
}: CaptureSessionInput) {
  const { captureMoment, error: momentError, clearError: clearMomentError } = useCaptureMoment();

  const isRecording = useRef(false);
  const isAborted = useRef(false);
  const isHolding = useRef(false);
  const holdStartedAt = useRef<number | undefined>(undefined);
  const heldMs = useRef<number | undefined>(undefined);
  const collectNonce = useRef(0);

  const [duration, setDuration] = useState<CaptureDuration>(() =>
    normalizeCaptureDuration(undefined),
  );
  const [stage, setStage] = useState<RecordingStage>('idle');
  const [remaining, setRemaining] = useState<number>(duration);
  const [captureError, setCaptureError] = useState<string>();
  // The most recently captured snap, handed up so the screen can fly the frame
  // into the snap counter. `nonce` makes each capture a distinct event even when
  // the same file id recurs.
  const [lastCollected, setLastCollected] = useState<{ nonce: number; uri: string }>();

  useEffect(() => {
    if (stage !== 'recording') return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(duration - elapsedSeconds, 0));
    }, 250);

    return () => clearInterval(timer);
  }, [duration, stage]);

  const clearError = () => {
    setCaptureError(undefined);
    clearMomentError();
  };

  const startRecording = async () => {
    if (!device.canRecordNow() || stage !== 'idle' || isRecording.current) return;

    isRecording.current = true;
    clearError();
    onCaptureStart?.();

    try {
      if (device.soundEnabled) {
        const isMicrophoneGranted = await ensureMicrophonePermission();
        if (!isMicrophoneGranted) {
          setCaptureError(MICROPHONE_REQUIRED);
          return;
        }
      }

      // The mic permission prompt can outlast the press; a released finger
      // means the user no longer intends to collect.
      if (!device.canRecordNow() || !isHolding.current) return;

      setRemaining(duration);
      setStage('recording');
      impactFeedback('medium');

      const uri = await device.record(duration);
      if (isAborted.current) return;

      // Auto-stop at maxDuration resolves with the finger still down; measure
      // the hold at resolution time in that case.
      const finalHeldMs =
        heldMs.current ??
        (holdStartedAt.current !== undefined ? Date.now() - holdStartedAt.current : 0);
      if (!shouldCollectHold(finalHeldMs)) {
        // Accidental tap: leave the temp recording in the cache (the OS
        // reclaims it) and return to idle without collecting or erroring.
        setStage('idle');
        return;
      }

      if (!uri) {
        setCaptureError(CAPTURE_RESULT_MISSING);
        setStage('idle');
        return;
      }

      setStage('saving');
      // Persist the snap. It is filed into nothing — the user picks material
      // later in the snap tab — so there is no review step here.
      const snap = await captureMoment(uri, { durationSec: duration });
      if (!snap) {
        setStage('idle');
        return;
      }

      if (isAborted.current) return;
      // Continuous capture: stay in the viewfinder, ready for the next hold, so
      // the user is never yanked away mid-session.
      collectNonce.current += 1;
      setLastCollected({ nonce: collectNonce.current, uri: snap.uri });
      successFeedback();
      setStage('idle');
    } catch {
      setCaptureError(CAPTURE_FAILED);
      setStage('idle');
    } finally {
      isRecording.current = false;
    }
  };

  // Press-and-hold capture gesture: recording runs only while the shutter is
  // held. Release stops it early; the native maxDuration still ends it
  // automatically when the ring completes.
  const beginHold = () => {
    if (stage !== 'idle' || isRecording.current) return;
    isHolding.current = true;
    holdStartedAt.current = Date.now();
    heldMs.current = undefined;
    void startRecording();
  };

  const endHold = () => {
    if (!isHolding.current) return;
    isHolding.current = false;
    if (holdStartedAt.current !== undefined) {
      heldMs.current = Date.now() - holdStartedAt.current;
    }
    if (isRecording.current) device.stop();
  };

  // The duration is tuned only while idle; once a hold starts the run is
  // committed.
  const selectDuration = (nextDuration: CaptureDuration) => {
    if (stage !== 'idle') return;
    setDuration(nextDuration);
    setRemaining(nextDuration);
    selectionFeedback();
  };

  return {
    stage,
    remaining,
    isBusy: stage === 'recording' || stage === 'saving',
    duration,
    selectDuration,
    lastCollected,
    errorMessage: captureError ?? momentError ?? undefined,
    beginHold,
    endHold,
    /** Back to a fresh viewfinder without touching what was already saved. */
    reset: () => {
      setRemaining(duration);
      setStage('idle');
    },
    /**
     * The screen is going away: stop the camera and ignore anything the
     * in-flight run resolves with, so it cannot write state into a dead screen.
     */
    abort: () => {
      isAborted.current = true;
      if (isRecording.current) device.stop();
    },
    clearError,
  };
}
