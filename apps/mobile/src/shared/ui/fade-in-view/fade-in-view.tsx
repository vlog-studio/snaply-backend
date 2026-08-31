import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/shared/ui/theme';

export type FadeInViewProps = React.PropsWithChildren<{
  delay?: number;
  duration?: number;
  fromScale?: number;
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Mount-time fade-in driven by a shared value instead of an `entering` preset.
 * Reanimated `entering` animations (FadeInDown, ZoomIn, …) never start on iOS
 * in Expo Go, leaving the view stuck at opacity 0, while runtime shared-value
 * animations work on both platforms.
 */
export function FadeInView({
  children,
  delay = 0,
  duration = 420,
  fromScale = 1,
  offsetY = 14,
  style,
}: FadeInViewProps) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      // Reduced motion: present the final state immediately, no fade/translate.
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, duration, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * offsetY },
      { scale: fromScale + (1 - fromScale) * progress.value },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
