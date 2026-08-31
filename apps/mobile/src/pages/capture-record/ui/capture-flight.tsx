import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Radius } from '@/shared/ui/theme';

// Long enough to read as the clip being pulled into the roll, short enough that
// continuous capture stays snappy.
const FLIGHT_MS = 480;

type CaptureFlightProps = {
  /** File URI of the just-collected clip; shown as a paused first frame. */
  uri: string;
  /** Called once the frame reaches the counter, so the page can bump + pop it. */
  onArrive: () => void;
};

/**
 * A just-captured snap flying up into the "스냅 N개" counter: a small paused
 * frame of the real footage lifts from the viewfinder, shrinks, and is pulled
 * toward the top counter, disappearing behind it. Rendered beneath the top bar
 * so it visibly tucks into the pill.
 */
export function CaptureFlight({ uri, onArrive }: CaptureFlightProps) {
  const { height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const onArriveRef = useRef(onArrive);

  useEffect(() => {
    onArriveRef.current = onArrive;
  }, [onArrive]);

  // A stable JS-runtime reference for runOnJS: the withTiming worklet cannot
  // schedule a function defined inside itself, so notify through this instead.
  const notifyArrive = useCallback(() => {
    onArriveRef.current();
  }, []);

  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.muted = true;
    videoPlayer.pause();
  });

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: FLIGHT_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(notifyArrive)();
      },
    );
  }, [progress, notifyArrive]);

  const flightStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.75 ? 1 : Math.max(1 - (p - 0.75) / 0.25, 0),
      transform: [{ translateY: -p * height * 0.4 }, { scale: 1 - p * 0.86 }],
    };
  });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.frame, flightStyle]}>
        <VideoView
          allowsPictureInPicture={false}
          contentFit="cover"
          nativeControls={false}
          player={player}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 128,
    aspectRatio: 0.66,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 0 26px rgba(234,94,56,0.5)',
  },
});
