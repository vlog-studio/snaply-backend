import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type ProgressRingProps = {
  /** 0–1. */
  progress: number;
  size: number;
  strokeWidth?: number;
};

/**
 * The generation step's progress ring, with the percentage in the middle.
 *
 * Not animated: the value is redrawn by the step's own second-by-second read of
 * the job clock, which advances the arc in small steps already. `HoldRing` is the
 * animated counterpart — it fills over a known duration from a shared value —
 * whereas this one is told where it is.
 */
export function ProgressRing({ progress, size, strokeWidth = 8 }: ProgressRingProps) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const clamped = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={[styles.ring, { width: size, height: size }]}>
      <Svg height={size} width={size} pointerEvents="none">
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.ai}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          fill="none"
          // Start the arc at the top rather than at three o'clock.
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.label} pointerEvents="none">
        <ThemedText selectable={false} type="title">
          {Math.round(clamped * 100)}%
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
