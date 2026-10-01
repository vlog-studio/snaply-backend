import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CutTransition, TransitionKind } from '@/entities/movie';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { transitionPickerRows } from '../model/transition-picker-rows';
import { TransitionGlyph } from './transition-glyph';

export type TransitionPickerSheetProps = {
  visible: boolean;
  /** The boundary's position: after cut `index` (0-based), before cut `index + 1`. */
  index: number;
  /** What applies at this boundary now, or `undefined` while it is being picked. */
  current: CutTransition | undefined;
  /** What the stage and the render will actually play there, when it differs. */
  playedKind: TransitionKind | undefined;
  /** False while a job owns the movie; the rows become a read-out. */
  canEdit: boolean;
  /** The user's pick, or `undefined` to hand the boundary back (자동으로 고르기). */
  onPick: (kind: TransitionKind | undefined) => void;
  onClose: () => void;
};

/**
 * How one cut hands over to the next, picked from a sheet (root
 * docs/specs/movie.md MOV-22).
 *
 * The rows and their read-outs are `transitionPickerRows`. A pick closes the
 * sheet and the page plays the boundary at once — a transition is judged by
 * watching it, which the sheet would cover.
 */
export function TransitionPickerSheet({
  visible,
  index,
  current,
  playedKind,
  canEdit,
  onPick,
  onClose,
}: TransitionPickerSheetProps) {
  const theme = useTheme();
  const rows = transitionPickerRows(current, playedKind);

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="컷 사이 전환 선택">
      <View style={styles.sheet}>
        <View style={styles.head}>
          <ThemedText type="heading">전환</ThemedText>
          <ThemedText type="note" themeColor="textSecondary">
            컷 {index + 1} → {index + 2}
          </ThemedText>
        </View>
        <View style={styles.list}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: row.selected, disabled: !canEdit }}
              accessibilityLabel={row.note ? `${row.label} · ${row.note}` : row.label}
              disabled={!canEdit}
              onPress={() => onPick(row.kind)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: theme.backgroundSelected,
                  borderColor: row.selected ? theme.primary : theme.border,
                  borderWidth: row.selected ? 2 : 1,
                  opacity: !canEdit && !row.selected ? 0.55 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name={row.kind ? TransitionGlyph[row.kind] : 'sparkles-outline'}
                size={20}
                color={row.selected ? theme.primary : theme.textSecondary}
              />
              <View style={styles.rowText}>
                <ThemedText selectable={false} type="smallBold">
                  {row.label}
                </ThemedText>
                {row.note ? (
                  <ThemedText selectable={false} type="note" themeColor="textSecondary">
                    {row.note}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.three },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
