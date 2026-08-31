import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { Cut } from '../model/use-movie-cuts';

export type CutInspectorProps = {
  cut: Cut;
  index: number;
  count: number;
  /** False for the last remaining cut: a movie must keep at least one. */
  canRemove: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onResetTrim: (index: number) => void;
  /** Lets the cut go, which brings the generate button back to this slot. */
  onDeselect: () => void;
};

/**
 * The selected cut's controls: where it sits, and the way out.
 *
 * One inspector for whichever cut the strip has picked, instead of one row of
 * controls per cut. It renders in the footer's action slot, standing in for
 * the generate button while a cut is held — the slot's height never changes,
 * so selecting and releasing a cut cannot make the stage above jump. That slot
 * is one button tall, which is why the read-out rides beside the position on
 * a single line instead of under it. The cut's *length* is not set here — the
 * trim handles live on the selected clip in the timeline itself — the
 * inspector reads the result out and offers `전체 사용` to drop a trim. Order
 * is changed with ◀ ▶ rather than by dragging: two buttons are reachable
 * one-handed, work with assistive touch, and need no gesture arbitration; a
 * drag strip can replace them later without changing what is committed.
 *
 * Two things about the row's edges (2026-08-13). Removing a cut is a **trash**
 * icon, not the ✕ it used to be: ✕ closes things everywhere else in the app, so
 * the one control here that destroys something was wearing the app's dismiss
 * sign. And the row now opens with that dismissal for real — the leading ✕ lets
 * the cut go, which is what puts the generate button back in this slot. Letting
 * go was previously only a tap on the strip's empty space, which is a thing to
 * know rather than a thing to see, and it is the way back to the screen's own
 * next step.
 */
export function CutInspector({
  cut,
  index,
  count,
  canRemove,
  onMove,
  onRemove,
  onResetTrim,
  onDeselect,
}: CutInspectorProps) {
  const theme = useTheme();
  const number = index + 1;
  const missing = cut.snap === undefined;
  const isTrimmed = cut.ref.trim !== undefined;
  const isFirst = index === 0;
  const isLast = index === count - 1;

  const moveButton = (direction: -1 | 1) => {
    const disabled = direction === -1 ? isFirst : isLast;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`컷 ${number} ${direction === -1 ? '앞으로' : '뒤로'}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onMove(index, direction)}
        style={[styles.tool, { borderColor: theme.border, opacity: disabled ? 0.35 : 1 }]}
      >
        <Ionicons
          name={direction === -1 ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={theme.text}
        />
      </Pressable>
    );
  };

  return (
    <View style={styles.inspector}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="컷 선택 해제"
        hitSlop={6}
        onPress={onDeselect}
        style={({ pressed }) => [styles.release, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Ionicons name="close" size={20} color={theme.textSecondary} />
      </Pressable>

      <View style={styles.meta}>
        <View style={styles.metaLine}>
          <ThemedText type="smallBold">
            컷 {number}/{count}
          </ThemedText>
          <ThemedText
            type="small"
            numberOfLines={1}
            themeColor={missing ? 'danger' : 'textSecondary'}
            style={styles.readout}
          >
            {missing ? '원본이 삭제됐어요 · 빼주세요' : `사용 ${formatSeconds(cut.usedSec)}`}
          </ThemedText>
        </View>
        {/* The slot keeps its height when the action is absent, so the row —
            and the stage above, sized by what this zone leaves over — does not
            move as playback crosses trimmed and untrimmed cuts. */}
        <View style={styles.resetSlot}>
          {isTrimmed && cut.snap ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`컷 ${number} 전체 사용`}
              hitSlop={6}
              onPress={() => onResetTrim(index)}
            >
              <ThemedText selectable={false} type="note" themeColor="primary">
                전체 사용
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.tools}>
        {moveButton(-1)}
        {moveButton(1)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`컷 ${number} 빼기`}
          accessibilityState={{ disabled: !canRemove }}
          disabled={!canRemove}
          onPress={() => onRemove(index)}
          style={[styles.tool, { borderColor: theme.border }]}
        >
          <Ionicons
            name="trash-outline"
            size={18}
            color={canRemove ? theme.danger : theme.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inspector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  // Narrower than a bordered tool and unbordered: it dismisses the row rather
  // than acting on the cut, and the row is one button tall for every occupant.
  release: { width: 32, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  meta: { flex: 1, gap: Spacing.half },
  metaLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  readout: { flexShrink: 1 },
  // Matches the `edge` line's height (`Typography.micro`), reserved always.
  resetSlot: { height: 16, justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: Spacing.one },
  tool: {
    minWidth: 44,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
