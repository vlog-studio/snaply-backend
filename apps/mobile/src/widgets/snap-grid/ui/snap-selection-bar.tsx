import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type SnapSelectionBarProps = {
  selectedCount: number;
  /** Snaps the target already holds — what the remaining room is measured against. */
  heldCount: number;
  /** The target movie's cap. */
  capacity: number;
  /** What the picks are headed for: `새 무비`, or an existing movie's title. */
  targetLabel: string;
  /** Wording of the confirming action, since the target decides it. */
  confirmLabel: string;
  /**
   * What the picking rules just refused, if anything. It shows here — pinned
   * where the thumb already is — because a message inserted at the top of the
   * scroll is off-screen for a user deep in the grid, and inserting it shifts
   * every cell under their finger.
   */
  notice?: string;
  onClear: () => void;
  onConfirm: () => void;
  /**
   * Reports the bar's rendered height. The bar floats over the screen's scroll,
   * so the screen pads its content by exactly this much — a guessed constant is
   * wrong the moment the safe-area inset, the font scale, or the notice line
   * differs from the device it was measured on.
   */
  onHeight?: (height: number) => void;
  /**
   * Omitted where the screen does not own deletion: picking snaps *into* a
   * movie is not the place to delete originals out of the library.
   */
  onDelete?: () => void;
};

/**
 * The selection mode's bottom bar: how many snaps are picked against the
 * target's remaining room, and what can be done with them.
 *
 * It reports the room rather than a bare count because the ten-snap cap is the
 * product's one hard constraint (concept §5) and the moment it bites is here —
 * the user has to see why an eleventh pick is refused.
 */
export function SnapSelectionBar({
  selectedCount,
  heldCount,
  capacity,
  targetLabel,
  confirmLabel,
  notice,
  onClear,
  onConfirm,
  onDelete,
  onHeight,
}: SnapSelectionBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const room = Math.max(capacity - heldCount, 0);
  const canConfirm = selectedCount > 0 && room > 0;

  return (
    <View
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom + Spacing.four,
        },
      ]}
    >
      {notice ? (
        <ThemedText type="note" themeColor="danger" accessibilityLiveRegion="polite">
          {notice}
        </ThemedText>
      ) : null}

      <View style={styles.counts}>
        <ThemedText type="smallBold">{selectedCount}개 선택</ThemedText>
        <ThemedText
          type="note"
          themeColor={room === 0 ? 'danger' : 'textSecondary'}
          numberOfLines={1}
          style={styles.room}
        >
          {/* A target holding nothing yet (a movie about to be created) has no
              fill to report — its one fact is the cap. */}
          {heldCount > 0
            ? `${targetLabel} ${heldCount}/${capacity}${room === 0 ? ' · 가득 참' : ` · ${room}개 더`}`
            : `${targetLabel} · 최대 ${capacity}개`}
        </ThemedText>
      </View>

      <View style={styles.actions}>
        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${selectedCount}개 스냅 삭제`}
            accessibilityState={{ disabled: selectedCount === 0 }}
            disabled={selectedCount === 0}
            hitSlop={8}
            onPress={onDelete}
            style={styles.textAction}
          >
            <ThemedText
              selectable={false}
              type="smallBold"
              style={{ color: selectedCount > 0 ? theme.danger : theme.textSecondary }}
            >
              삭제
            </ThemedText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="선택 해제"
          accessibilityState={{ disabled: selectedCount === 0 }}
          disabled={selectedCount === 0}
          hitSlop={8}
          onPress={onClear}
          style={styles.textAction}
        >
          <ThemedText selectable={false} type="smallBold" themeColor="textSecondary">
            해제
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: !canConfirm }}
          disabled={!canConfirm}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.primaryAction,
            { backgroundColor: theme.primary, opacity: canConfirm ? (pressed ? 0.78 : 1) : 0.45 },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {confirmLabel}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  room: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  textAction: { minHeight: 44, justifyContent: 'center' },
  primaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
