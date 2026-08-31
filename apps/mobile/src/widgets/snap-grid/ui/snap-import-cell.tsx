import { Pressable, StyleSheet } from 'react-native';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type SnapImportCellProps = {
  /** Cell width in points; the cell is square, so this is its height too. */
  width: number;
  /** Dimmed and inert — while selecting, when a tap means picking. */
  disabled?: boolean;
  onPress: () => void;
};

/**
 * The grid's leading cell: bringing a snap in from a gallery video.
 *
 * It sits in the grid rather than in the header because that is where its
 * result lands — the snaps it produces appear in the cells beside it — and
 * because the header's right side is the mode switch's alone, so entering and
 * leaving selection no longer moves that control sideways.
 *
 * Shaped like a `SnapCell` (square, same corner radius) but dashed and empty:
 * it is a slot for material that does not exist yet, the same language the tray
 * and the movie timeline already use for an empty place.
 *
 * While selecting it dims instead of leaving: unmounting it slid every snap in
 * the leading row one cell over — under the very finger whose long-press had
 * just entered selection — which is the same sideways slide the move out of the
 * header was made to end.
 */
export function SnapImportCell({ width, disabled = false, onPress }: SnapImportCellProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="동영상에서 스냅 가져오기"
      accessibilityState={disabled ? { disabled: true } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        {
          width,
          height: width,
          borderColor: theme.primary,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <ThemedText selectable={false} type="heading" themeColor="primary">
        +
      </ThemedText>
      <ThemedText selectable={false} type="note" themeColor="primary">
        가져오기
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: Radius.xsmall,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
});
