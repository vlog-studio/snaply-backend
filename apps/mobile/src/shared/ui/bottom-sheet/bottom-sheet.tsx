import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, useReducedMotion, useTheme } from '@/shared/ui/theme';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  // Announced on the sheet surface for screen readers (e.g. "스냅 삭제 확인").
  accessibilityLabel?: string;
};

// Motion values. The panel leads and the backdrop trails it, which is the whole
// point of driving them separately: the Modal's own `animationType="slide"`
// animates the entire window, so the dimming layer visibly slid up with the
// panel as one block.
const PanelOpenDuration = 320;
const PanelCloseDuration = 220;
const BackdropFadeInDuration = 200;
const BackdropFadeOutDuration = 260;

// The shared-value writes live in module-level drivers rather than in callbacks
// defined in the component body: the React Compiler lint
// (`react-hooks/immutability`) rejects `.value` writes it sees there, and the
// accepted fix is to pass the shared values into a plain function.
function driveBackdropIn(backdropOpacity: SharedValue<number>, reducedMotion: boolean) {
  backdropOpacity.value = reducedMotion
    ? 1
    : withTiming(1, { duration: BackdropFadeInDuration, easing: Easing.out(Easing.quad) });
}

function drivePanelIn(panelProgress: SharedValue<number>, reducedMotion: boolean) {
  panelProgress.value = reducedMotion
    ? 1
    : withTiming(1, { duration: PanelOpenDuration, easing: Easing.out(Easing.cubic) });
}

function measurePanel(panelHeight: SharedValue<number>, height: number) {
  panelHeight.value = height;
}

// Reduced motion: no fade, no slide — the sheet is simply gone on the same tick.
function driveCloseImmediately(
  backdropOpacity: SharedValue<number>,
  panelProgress: SharedValue<number>,
  panelHeight: SharedValue<number>,
) {
  backdropOpacity.value = 0;
  panelProgress.value = 0;
  panelHeight.value = 0;
}

function driveClose(
  backdropOpacity: SharedValue<number>,
  panelProgress: SharedValue<number>,
  panelHeight: SharedValue<number>,
  onClosed: () => void,
) {
  backdropOpacity.value = withTiming(0, {
    duration: BackdropFadeOutDuration,
    easing: Easing.in(Easing.quad),
  });
  panelProgress.value = withTiming(
    0,
    { duration: PanelCloseDuration, easing: Easing.in(Easing.cubic) },
    (finished) => {
      // Interrupted by a re-open: keep the measurement and leave the mount alone.
      if (!finished) return;
      panelHeight.value = 0;
      runOnJS(onClosed)();
    },
  );
}

// A lightweight bottom sheet built on the platform Modal. The panel is anchored
// to the bottom and slides up while the backdrop only fades — two independent
// shared values over a Modal with no animation of its own. Tapping the backdrop
// dismisses it. Kept business-agnostic — callers pass their own content.
//
// The panel's travel distance is its own measured height, so the closed offset
// is not known until the first layout pass: the panel stays transparent until
// then, and the slide starts from `onLayout`. The measurement is dropped once
// the close animation finishes so the next open re-measures whatever content
// the caller passes that time.
//
// Mount outlives `visible`: the Modal stays up through the close animation and
// unmounts from the panel animation's completion callback.
//
// The sheet lifts itself clear of the keyboard, which a sheet holding a text
// field needs and one without never notices. `padding` is the behavior on both
// platforms: a transparent, status-bar-translucent Modal window does not get
// resized by Android's adjustResize, so the keyboard would otherwise sit on top
// of whatever is at the bottom of the sheet — in practice its primary action.
// While the keyboard is up the panel also drops its safe-area bottom padding,
// since the gesture bar it reserves room for is behind the keyboard; without
// that, a tall sheet lifts past the top of the screen instead of fitting above
// it.
export function BottomSheet({ visible, onClose, children, accessibilityLabel }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useSharedValue(0);
  const panelProgress = useSharedValue(0);
  const panelHeight = useSharedValue(0);
  // The open slide waits for the first layout; this keeps a later layout pass
  // (content changing while the sheet is open) from replaying it.
  const openStartedRef = useRef(false);

  // Mount changes that are not waiting on an animation are render-phase
  // adjustments, not effects: opening has to have the Modal up in the same
  // commit that starts the fade, and a reduced-motion close has nothing to wait
  // for. The animated close is the one that unmounts later, from `driveClose`'s
  // completion callback.
  if (visible && !mounted) setMounted(true);
  if (!visible && mounted && reducedMotion) setMounted(false);

  useEffect(() => {
    if (visible) {
      driveBackdropIn(backdropOpacity, reducedMotion);
      // A re-open after a completed close re-measures from `onLayout`; a re-open
      // that interrupted a close still has its height and starts here.
      if (panelHeight.value > 0 && !openStartedRef.current) {
        openStartedRef.current = true;
        drivePanelIn(panelProgress, reducedMotion);
      }
      return;
    }

    openStartedRef.current = false;
    if (reducedMotion) {
      driveCloseImmediately(backdropOpacity, panelProgress, panelHeight);
      return;
    }
    driveClose(backdropOpacity, panelProgress, panelHeight, () => setMounted(false));
  }, [backdropOpacity, panelHeight, panelProgress, reducedMotion, visible]);

  const handlePanelLayout = (event: LayoutChangeEvent) => {
    // A layout pass that lands while the sheet is closing (the keyboard
    // dismissing shifts the bottom padding) must neither retarget the running
    // slide nor start a new one.
    if (!visible) return;
    const { height } = event.nativeEvent.layout;
    if (height <= 0) return;
    measurePanel(panelHeight, height);
    if (openStartedRef.current) return;
    openStartedRef.current = true;
    drivePanelIn(panelProgress, reducedMotion);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelHeight.value === 0 ? 0 : 1,
    transform: [{ translateY: (1 - panelProgress.value) * panelHeight.value }],
  }));

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="none"
      visible={mounted}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityLabel="닫기"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.backdropPress}
          />
        </Animated.View>
        <Animated.View
          accessibilityLabel={accessibilityLabel}
          onLayout={handlePanelLayout}
          style={[
            styles.sheet,
            panelStyle,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              paddingBottom: keyboardVisible ? Spacing.four : insets.bottom + Spacing.six,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  backdropPress: { flex: 1 },
  sheet: {
    borderTopLeftRadius: Radius.xlarge,
    borderTopRightRadius: Radius.xlarge,
    borderCurve: 'continuous',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.two,
  },
});
