import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { recordedDayCount, type WeekDayRecord } from '../model/week-record';

const strokeWidth = 9;
/** Degrees of breathing room between two day segments. */
const gapAngle = 12;

/**
 * The 나 tab's hero: the brand's moment ring re-read as this week's record.
 * Seven segments, Monday at the top going clockwise, lit ember on the days a
 * snap was captured; the user's initial sits in the core where the avatar was.
 *
 * Not animated and not interactive — it is a read-out, the same standing the
 * old stat card had, drawn in the shape the app is named after.
 */
export function WeekRing({
  days,
  initial,
  size,
}: {
  days: readonly WeekDayRecord[];
  initial: string;
  size: number;
}) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentAngle = 360 / days.length;
  const dash = ((segmentAngle - gapAngle) / 360) * circumference;

  return (
    <View
      accessible
      accessibilityLabel={`이번 주 7일 중 ${recordedDayCount(days)}일 기록`}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} pointerEvents="none">
        {days.map((day, index) => (
          <Circle
            key={day.label}
            cx={center}
            cy={center}
            r={radius}
            stroke={day.recorded ? theme.primary : theme.backgroundSelected}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${circumference}`}
            // Monday starts at twelve o'clock; each day rotates one segment on.
            transform={`rotate(${-90 + index * segmentAngle + gapAngle / 2} ${center} ${center})`}
          />
        ))}
      </Svg>
      <View style={[styles.core, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText selectable={false} type="title">
          {initial}
        </ThemedText>
      </View>
    </View>
  );
}

/** Gap between the ring stroke and the avatar core. */
const coreInset = strokeWidth + 10;

const styles = StyleSheet.create({
  core: {
    position: 'absolute',
    top: coreInset,
    left: coreInset,
    right: coreInset,
    bottom: coreInset,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
