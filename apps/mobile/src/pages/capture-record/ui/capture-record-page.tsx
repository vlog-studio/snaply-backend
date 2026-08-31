import { CameraView } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type CaptureDuration } from '@/entities/capture-session';
import { useSnaps } from '@/entities/snap';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Radius, Spacing, ThemeScope, useReducedMotion, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoPreview } from '@/shared/ui/video-preview';

import { useCaptureRecorder } from '../model/use-capture-recorder';
import { CaptureFlight } from './capture-flight';
import { HoldRing } from './hold-ring';
import { RecordingLibrary } from './recording-library';

// How long the "담김" confirmation badge lingers after a capture.
const COLLECTED_BADGE_MS = 1100;

// The capture ring sits just outside the 88px shutter (5px stroke + gap).
const HOLD_RING_SIZE = 108;

const DURATION_OPTIONS: readonly CaptureDuration[] = [3, 5];

/**
 * The viewfinder's ground is the camera feed and near-black scrims, so its
 * chrome is pinned to the dark palette (and a light status bar) no matter
 * which theme the rest of the app resolves to.
 */
export function CaptureRecordPage() {
  return (
    <ThemeScope scheme="dark">
      <StatusBar style="light" />
      <CaptureRecordScreen />
    </ThemeScope>
  );
}

function CaptureRecordScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    stage,
    showCamera,
    errorMessage,
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
  } = useCaptureRecorder();
  // Read out once rather than through `camera.x`: the device group holds the
  // camera handle, and the compiler treats a member read on it during render as
  // reading a ref.
  const {
    attachCamera,
    facing,
    soundEnabled,
    isReady,
    isRecordingSupported,
    toggleFacing,
    toggleSound,
    handleCameraReady,
    handleMountError,
  } = camera;

  // In-camera feedback: the just-captured snap flies up into the counter; when
  // it lands, the count bumps and the counter pops. Capturing stays on the
  // viewfinder instead of bouncing back to the studio.
  const reducedMotion = useReducedMotion();
  const collectedCount = useSnaps().length;
  const collectedCountRef = useRef(collectedCount);

  useEffect(() => {
    collectedCountRef.current = collectedCount;
  }, [collectedCount]);

  // The pill count trails the store until the flying frame arrives, so the
  // number bumps as it lands rather than the instant it is persisted.
  const [displayedCount, setDisplayedCount] = useState(collectedCount);
  const [flight, setFlight] = useState<{ key: number; uri: string }>();
  const [showCollectedBadge, setShowCollectedBadge] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const processedNonce = useRef(0);
  const badgeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counterPulse = useSharedValue(0);

  const flashCollectedBadge = () => {
    setShowCollectedBadge(true);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setShowCollectedBadge(false), COLLECTED_BADGE_MS);
  };

  // The frame reached the counter: reveal the new count and pop the pill.
  const handleFlightArrive = () => {
    setFlight(undefined);
    setDisplayedCount(collectedCountRef.current);
    setPulseKey((key) => key + 1);
    flashCollectedBadge();
  };

  // Each capture starts a flight; reduced motion lands it immediately.
  useEffect(() => {
    const nonce = session.lastCollected?.nonce ?? 0;
    if (nonce === 0 || nonce === processedNonce.current) return;
    processedNonce.current = nonce;
    if (reducedMotion) {
      setDisplayedCount(collectedCountRef.current);
      flashCollectedBadge();
      return;
    }
    setFlight({ key: nonce, uri: session.lastCollected?.uri ?? '' });
  }, [session.lastCollected, reducedMotion]);

  // Pop the counter on landing (kept in an effect so the shared-value write is
  // outside any memoized callback).
  useEffect(() => {
    if (pulseKey === 0) return;
    counterPulse.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 440, easing: Easing.out(Easing.cubic) }),
    );
  }, [pulseKey, counterPulse]);

  useEffect(
    () => () => {
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
    },
    [],
  );

  const counterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + counterPulse.value * 0.16 }],
  }));

  if (!permissions.isCameraGranted && stage !== 'review') {
    return (
      <View
        style={[
          styles.permissionScreen,
          { backgroundColor: theme.media, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Pressable
          accessibilityLabel="촬영 닫기"
          onPress={closePage}
          style={[styles.permissionClose, { top: insets.top + Spacing.three }]}
        >
          <ThemedText selectable={false} style={styles.utilityIcon}>
            ×
          </ThemedText>
        </Pressable>
        <View style={styles.permissionContent}>
          <View style={[styles.permissionIcon, { borderColor: theme.primary }]}>
            <ThemedText
              selectable={false}
              style={[styles.permissionIconText, { color: theme.primary }]}
            >
              ●
            </ThemedText>
          </View>
          <ThemedText type="title" style={styles.whiteText}>
            카메라를 사용할 수 없어요
          </ThemedText>
          <ThemedText style={styles.permissionDescription}>{permissions.message}</ThemedText>
          {permissions.isPermissionReady ? (
            <SnaplyButton
              title={permissions.canAskAgain ? '카메라·마이크 권한 허용' : '설정에서 권한 열기'}
              onPress={
                permissions.canAskAgain
                  ? permissions.requestPermissions
                  : permissions.openAppSettings
              }
              style={styles.permissionAction}
            />
          ) : null}
          <SnaplyButton
            title={`찍어둔 스냅 보기 (${library.recordings.length})`}
            variant="secondary"
            onPress={openLibrary}
            style={styles.permissionAction}
          />
          {library.errorMessage ? (
            <ThemedText type="small" style={styles.permissionError}>
              {library.errorMessage}
            </ThemedText>
          ) : null}
        </View>
        <RecordingLibrary
          deletingId={library.deletingId}
          isLoading={library.isLoading}
          onClose={library.close}
          onDelete={deleteRecording}
          onSelect={selectRecording}
          recordings={library.recordings}
          visible={library.isVisible}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.media }]}>
      <View style={[styles.cameraSurface, { paddingTop: insets.top + Spacing.three }]}>
        {showCamera ? (
          <CameraView
            facing={facing}
            mirror={facing === 'front'}
            mode="video"
            mute={!soundEnabled}
            onCameraReady={handleCameraReady}
            onMountError={({ message }) => handleMountError(message || '')}
            ref={attachCamera}
            style={StyleSheet.absoluteFill}
            videoQuality="720p"
          />
        ) : null}
        {stage === 'review' && library.selected && !library.isVisible ? (
          <VideoPreview
            key={library.selected.id}
            muted={!soundEnabled}
            uri={library.selected.uri}
          />
        ) : null}

        <View style={styles.cameraShade} pointerEvents="none" />

        {flight ? (
          <CaptureFlight key={flight.key} uri={flight.uri} onArrive={handleFlightArrive} />
        ) : null}

        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="촬영 닫기"
            onPress={closePage}
            style={styles.utilityButton}
          >
            <ThemedText selectable={false} style={styles.utilityIcon}>
              ×
            </ThemedText>
          </Pressable>
          <Animated.View style={[styles.modePill, counterStyle]}>
            <ThemedText selectable={false} type="note" style={styles.whiteText}>
              스냅{displayedCount > 0 ? ` ${displayedCount}개` : ''}
            </ThemedText>
          </Animated.View>
          <Pressable
            accessibilityLabel={soundEnabled ? '녹음 소리 끄기' : '녹음 소리 켜기'}
            accessibilityState={{ disabled: session.isBusy }}
            disabled={session.isBusy}
            onPress={toggleSound}
            style={[styles.utilityButton, session.isBusy && styles.disabledControl]}
          >
            <ThemedText selectable={false} style={styles.soundIcon}>
              {soundEnabled ? '♪' : '∅'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.focusArea} pointerEvents="box-none">
          {stage === 'idle' && !showCollectedBadge ? (
            <View style={styles.focusFrame} pointerEvents="none">
              <ThemedText selectable={false} type="note" style={styles.frameMeta}>
                꾹 눌러 촬영
              </ThemedText>
            </View>
          ) : null}
          {stage === 'idle' && showCollectedBadge ? (
            <View style={[styles.completedBadge, { backgroundColor: 'rgba(14,11,8,0.82)' }]}>
              <ThemedText selectable={false} type="note" style={{ color: theme.lumen }}>
                담김 · 스냅 {displayedCount}개
              </ThemedText>
            </View>
          ) : null}
          {stage === 'recording' ? (
            <View style={styles.recordingStatus}>
              <View style={[styles.recordingDot, { backgroundColor: theme.primary }]} />
              <ThemedText type="edge" style={styles.whiteText}>
                REC
              </ThemedText>
              {/* The countdown is Latin and reruns every second, so it stays a
                  mono stamp with tabular figures and holds its width as it
                  ticks. The Korean tail it ends on cannot be mono at all, and
                  takes `note` for that one frame. */}
              <ThemedText
                type={session.remaining > 0 ? 'edge' : 'note'}
                style={[styles.whiteText, styles.tabularNumber]}
              >
                {session.remaining > 0 ? `${session.remaining}s` : '마무리 중…'}
              </ThemedText>
            </View>
          ) : null}
          {stage === 'saving' ? (
            <View style={[styles.completedBadge, { backgroundColor: 'rgba(14,11,8,0.82)' }]}>
              <ThemedText selectable={false} type="note" style={{ color: theme.amber }}>
                스냅을 저장하는 중…
              </ThemedText>
            </View>
          ) : null}
          {stage === 'review' ? (
            <View style={[styles.completedBadge, { backgroundColor: 'rgba(14,11,8,0.82)' }]}>
              <ThemedText selectable={false} type="note" style={{ color: theme.lumen }}>
                저장됨
              </ThemedText>
            </View>
          ) : null}
          {errorMessage ? (
            <Pressable
              accessibilityRole="button"
              onPress={dismissErrors}
              style={styles.errorBanner}
            >
              <ThemedText type="smallBold" style={styles.whiteText}>
                {errorMessage}
              </ThemedText>
              <ThemedText selectable={false} type="small" style={styles.errorDismiss}>
                닫기
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + Spacing.five }]}>
          {stage === 'idle' && isRecordingSupported ? (
            <View style={styles.durationToggle}>
              {DURATION_OPTIONS.map((seconds) => {
                const isSelected = session.duration === seconds;
                return (
                  <Pressable
                    key={seconds}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${seconds}초`}
                    onPress={() => session.selectDuration(seconds)}
                    style={[styles.durationSeg, isSelected && styles.durationSegActive]}
                  >
                    <ThemedText
                      selectable={false}
                      type="smallBold"
                      style={isSelected ? { color: theme.media } : styles.mutedWhite}
                    >
                      {seconds}초
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {stage === 'review' ? (
            <View style={styles.reviewActions}>
              <SnaplyButton title="다시 담기" style={styles.reviewButton} onPress={retake} />
            </View>
          ) : (
            <View style={styles.captureControls}>
              <Pressable
                accessibilityLabel={`저장 영상 ${library.recordings.length}개 보기`}
                accessibilityRole="button"
                disabled={session.isBusy}
                onPress={openLibrary}
                style={[styles.sideControl, session.isBusy && styles.disabledControl]}
              >
                <ThemedText selectable={false} style={styles.sideControlIcon}>
                  ▣
                </ThemedText>
                <ThemedText selectable={false} type="small" style={styles.mutedWhite}>
                  스냅 {library.recordings.length}
                </ThemedText>
              </Pressable>
              <View style={styles.shutterArea}>
                <HoldRing
                  active={stage === 'recording'}
                  durationMs={session.duration * 1000}
                  size={HOLD_RING_SIZE}
                />
                <Pressable
                  accessibilityHint="누르는 동안 담기고, 손을 떼면 끝나요"
                  accessibilityLabel="꾹 눌러 담기"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: stage === 'saving' || !isReady || !isRecordingSupported,
                  }}
                  disabled={stage === 'saving' || !isReady || !isRecordingSupported}
                  onPressIn={session.beginHold}
                  onPressOut={session.endHold}
                  style={[
                    styles.shutterOuter,
                    stage === 'recording' && styles.shutterRecording,
                    (!isReady || !isRecordingSupported) && styles.disabledControl,
                  ]}
                >
                  <View
                    style={[
                      styles.shutterInner,
                      { backgroundColor: theme.primary },
                      stage === 'recording' && styles.shutterInnerRecording,
                    ]}
                  />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="카메라 전환"
                accessibilityRole="button"
                disabled={session.isBusy}
                onPress={toggleFacing}
                style={[styles.sideControl, session.isBusy && styles.disabledControl]}
              >
                <ThemedText selectable={false} style={styles.sideControlIcon}>
                  ↻
                </ThemedText>
                <ThemedText selectable={false} type="small" style={styles.mutedWhite}>
                  전환
                </ThemedText>
              </Pressable>
            </View>
          )}
          {/* The viewfinder narrates itself: the frame says how to shoot, the
              badges say what stage it is in. The only line left is the one the
              UI cannot show — a platform that has no recorder at all. */}
          {!isRecordingSupported ? (
            <ThemedText type="small" style={styles.helperText}>
              촬영은 iOS 또는 Android 기기에서 사용할 수 있어요
            </ThemedText>
          ) : null}
          {stage === 'review' ? (
            <Pressable accessibilityRole="button" onPress={openLibrary} style={styles.libraryLink}>
              <ThemedText selectable={false} type="smallBold" style={styles.whiteText}>
                찍어둔 스냅 {library.recordings.length}개 관리
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <RecordingLibrary
        deletingId={library.deletingId}
        isLoading={library.isLoading}
        onClose={library.close}
        onDelete={deleteRecording}
        onSelect={selectRecording}
        recordings={library.recordings}
        visible={library.isVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cameraSurface: { flex: 1, overflow: 'hidden' },
  cameraShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  topBar: {
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  utilityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityIcon: { color: '#FFFFFF', fontSize: 30, lineHeight: 32 },
  soundIcon: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  modePill: {
    backgroundColor: 'rgba(0,0,0,0.36)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  focusArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
    paddingHorizontal: Spacing.five,
  },
  focusFrame: {
    width: '72%',
    maxWidth: 340,
    aspectRatio: 0.8,
    borderRadius: Radius.xlarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Spacing.four,
  },
  frameMeta: { color: 'rgba(255,255,255,0.66)' },
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.48)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4 },
  completedBadge: {
    backgroundColor: 'rgba(46,173,113,0.9)',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  errorBanner: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(120,20,20,0.92)',
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  errorDismiss: { color: 'rgba(255,255,255,0.72)' },
  bottomControls: { paddingHorizontal: Spacing.five, gap: Spacing.three },
  durationToggle: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.36)',
  },
  durationSeg: {
    minWidth: 56,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  durationSegActive: { backgroundColor: '#FFFFFF' },
  captureControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  shutterArea: {
    width: HOLD_RING_SIZE,
    height: HOLD_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    boxShadow: '0 0 22px rgba(234,94,56,0.5)',
  },
  shutterRecording: { transform: [{ scale: 0.92 }] },
  shutterInnerRecording: { width: 32, height: 32, borderRadius: Radius.small },
  sideControl: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  sideControlIcon: { color: '#FFFFFF', fontSize: 26, lineHeight: 28 },
  disabledControl: { opacity: 0.42 },
  reviewActions: { flexDirection: 'row', gap: Spacing.three },
  reviewButton: { flex: 1 },
  helperText: { color: 'rgba(255,255,255,0.72)', textAlign: 'center' },
  libraryLink: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  whiteText: { color: '#FFFFFF' },
  mutedWhite: { color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 18 },
  tabularNumber: { fontVariant: ['tabular-nums'] },
  permissionScreen: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.five },
  permissionClose: {
    position: 'absolute',
    left: Spacing.four,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionContent: { alignItems: 'center', gap: Spacing.four },
  permissionIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionIconText: { fontSize: 44, lineHeight: 48 },
  permissionDescription: { color: 'rgba(255,255,255,0.72)', textAlign: 'center' },
  permissionError: { color: '#FFB4AB', textAlign: 'center' },
  permissionAction: { width: '100%', maxWidth: 360 },
});
