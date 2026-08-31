import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useReducedMotion, useTheme } from '@/shared/ui/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Reduced motion shows a static partial arc as the "holding" indicator instead
// of a continuous fill (concept §7 저감 모션; matches the motion.html demo).
const REDUCED_MOTION_FILL = 0.4;
const RELEASE_RESET_MS = 250;

type HoldRingProps = {
  /** Fills 0→1 over `durationMs` while true; rewinds to 0 when it turns false. */
  active: boolean;
  durationMs: number;
  size: number;
  strokeWidth?: number;
};

/**
 * 담기 링: the safelight progress ring around the shutter. While
 * the shutter is held it fills linearly over the selected clip duration
 * (stroke-dashoffset), and on release it snaps back over 250ms.
 */
export function HoldRing({ active, durationMs, size, strokeWidth = 5 }: HoldRingProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  useEffect(() => {
    if (active) {
      progress.value = reducedMotion
        ? REDUCED_MOTION_FILL
        : withTiming(1, { duration: durationMs, easing: Easing.linear });
      return;
    }
    progress.value = reducedMotion
      ? 0
      : withTiming(0, { duration: RELEASE_RESET_MS, easing: Easing.out(Easing.cubic) });
  }, [active, durationMs, progress, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <Svg height={size} pointerEvents="none" style={styles.ring} width={size}>
      <Circle
        cx={center}
        cy={center}
        fill="none"
        r={radius}
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={strokeWidth}
      />
      <AnimatedCircle
        animatedProps={animatedProps}
        cx={center}
        cy={center}
        fill="none"
        r={radius}
        stroke={theme.primary}
        strokeDasharray={`${circumference}`}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute' },
});
