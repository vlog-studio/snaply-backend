import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { Snap } from '@/entities/snap';
import { formatDuration } from '@/shared/lib/datetime';
import { MaxContentWidth, Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { SnapDay } from '../model/use-snap-days';
import { SnapCell } from './snap-cell';
import { SnapImportCell } from './snap-import-cell';

export type SnapDayGridProps = {
  days: readonly SnapDay[];
  /** Whether a tap picks instead of playing. */
  selecting: boolean;
  /** The picked ids in pick order; a cell draws its position from this. */
  picked: readonly string[];
  /** Snaps the picks' target already holds — the `담김` badge. */
  heldIds: ReadonlySet<string>;
  onPress: (snap: Snap) => void;
  /** Omitted where the grid is only ever in selection mode. */
  onLongPress?: (snap: Snap) => void;
  /**
   * Adds the leading `가져오기` cell. Omitted where the screen does not own
   * importing — a movie's picker only chooses among snaps that already exist.
   * While selecting the cell stays but goes inert: removing it slides every
   * snap in the leading row one cell over, under the user's finger.
   */
  onImport?: () => void;
};

/** Three columns, as in the mockup: wide enough to read, dense enough to scan. */
const Columns = 3;

/** Nothing at all. The screen above decides what to say instead. */
const NoLongPress = () => {};

/**
 * The snap library drawn as day sections of square cells — the block both
 * screens that pick snaps are built around: the Snap tab, where picks go to the
 * studio's tray, and a movie's 스냅 더 넣기, where they go to its cut list.
 *
 * It draws sections and cells only. Whether the screen is selecting, what the
 * target is, and whether the library can be imported into are all the screen's
 * to decide, because those are the parts the two differ on. Importing is one of
 * them: the Snap tab leads the grid with the `가져오기` cell, a movie's picker
 * offers no such thing.
 *
 * The grid assumes the standard content column: full width up to
 * `MaxContentWidth`, padded by `Spacing.five` on both sides. It derives its cell
 * width from that instead of measuring, so the cells lay out on their very
 * first frame.
 */
export function SnapDayGrid({
  days,
  selecting,
  picked,
  heldIds,
  onPress,
  onLongPress = NoLongPress,
  onImport,
}: SnapDayGridProps) {
  const { width: windowWidth } = useWindowDimensions();

  const gridWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.five * 2;
  const cellWidth = Math.floor((gridWidth - Spacing.one * (Columns - 1)) / Columns);

  // The import cell leads the newest day's row, and stands alone when there is
  // no day at all: an empty library still has to offer the way out of being
  // empty, and this is that way — the other one is the shell's capture button.
  // Disabled rather than unmounted while selecting, so entering and leaving
  // selection never shifts the grid.
  const importCell = onImport ? (
    <SnapImportCell width={cellWidth} disabled={selecting} onPress={onImport} />
  ) : null;

  if (days.length === 0) {
    return importCell ? <View style={styles.grid}>{importCell}</View> : null;
  }

  return (
    <>
      {days.map((day, dayIndex) => (
        <View key={day.key} style={styles.day}>
          <View style={styles.dayHead}>
            <ThemedText type="smallBold">{day.label}</ThemedText>
            <ThemedText type="note" themeColor="textSecondary">
              {day.snaps.length}개 · {formatDuration(totalSecOf(day.snaps))}
            </ThemedText>
          </View>
          <View style={styles.grid}>
            {dayIndex === 0 ? importCell : null}
            {day.snaps.map((snap) => {
              const index = picked.indexOf(snap.id);
              return (
                <SnapCell
                  key={snap.id}
                  snap={snap}
                  width={cellWidth}
                  pickNumber={index >= 0 ? index + 1 : undefined}
                  selecting={selecting}
                  isHeld={heldIds.has(snap.id)}
                  onPress={onPress}
                  onLongPress={onLongPress}
                />
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}

function totalSecOf(snaps: readonly Snap[]): number {
  return snaps.reduce((sum, snap) => sum + snap.durationSec, 0);
}

const styles = StyleSheet.create({
  day: { gap: Spacing.two },
  dayHead: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
