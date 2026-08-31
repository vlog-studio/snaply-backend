import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ConfidenceKind, FilledSlot } from '@/features/fill-template';
import { formatSeconds, formatTimestamp } from '@/shared/lib/datetime';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

export type SlotRowProps = {
  filled: FilledSlot;
  /** What `filled.confidence` measures. The row prints the number and says so out loud. */
  confidenceKind: ConfidenceKind;
  index: number;
  onShoot: (slotId: string) => void;
  onDrop: (slotId: string) => void;
  onRestore: (slotId: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
};

/**
 * Square on purpose, not 9:16 like the snap it samples. The frame is an
 * identifying glance, and matching the source ratio only bought 32dp of row
 * height that pushed the next scene off screen — the list has to be scannable as
 * an *order* of scenes, which costs more than a full-height crop is worth.
 * `VideoFrame` covers, so the middle of the shot survives.
 */
const FrameSize = 64;

/** Icon buttons sit below the 44dp minimum, so every one of them carries hitSlop. */
const ControlSize = 28;
const ControlHitSlop = 10;
const IconSize = 18;

/**
 * One scene of the template: what to shoot, what the match put there, and the
 * controls that reorder or clear it.
 *
 * The label is the instruction and the line under it is the evidence — when the
 * snap was taken, and how sure the app is it belongs to the same outing. They are
 * kept visibly separate on purpose: the app has not looked at the picture and
 * must not read as though it has, so it reports a time and a percentage rather
 * than claiming the snap *is* a 골목.
 *
 * The percentage is printed bare. It sat behind `같은 외출 확신 NN%` and that
 * label, repeated down six rows that all score the same, cost more width than it
 * bought — visually, what the number measures belongs in the screen once, as the
 * column's own heading. It is **not** left unsaid: the number carries the meaning
 * in its accessibility label, where repeating it costs no width at all.
 * See `docs/features/movie-templates.md`.
 */
export function SlotRow({
  filled,
  confidenceKind,
  index,
  onShoot,
  onDrop,
  onRestore,
  onMove,
}: SlotRowProps) {
  const theme = useTheme();
  const { slot, snap, confidence, canMoveUp, canMoveDown } = filled;

  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      {snap ? (
        // `VideoFrame` absolute-fills its parent, so the frame's size has to live
        // on a wrapper — handing it to the component directly takes the thumbnail
        // out of the row's flow and the body then renders on top of it.
        <View style={[styles.frame, { borderColor: theme.border }]}>
          <VideoFrame uri={snap.uri} />
        </View>
      ) : (
        <View
          style={[
            styles.placeholder,
            { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          ]}
        >
          <ThemedText selectable={false} type="note" themeColor="textSecondary">
            비어 있음
          </ThemedText>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText type="smallBold">{slot.label}</ThemedText>
          {confidence !== undefined ? (
            <ThemedText
              accessibilityLabel={`${confidenceLabel(confidenceKind)} ${Math.round(confidence * 100)}퍼센트`}
              selectable={false}
              type="edge"
              themeColor="lumen"
            >
              {Math.round(confidence * 100)}%
            </ThemedText>
          ) : null}
        </View>

        <ThemedText type="xsmall" themeColor="textSecondary">
          {snap
            ? `${formatTimestamp(snap.capturedAt)} · ${formatSeconds(snap.durationSec)}`
            : slot.hint}
        </ThemedText>

        {snap === undefined || confidence === undefined ? (
          <View style={styles.actions}>
            {snap ? (
              <ThemedText selectable={false} type="note" themeColor="primary">
                방금 찍은 컷
              </ThemedText>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${slot.label} 지금 찍기`}
                  hitSlop={8}
                  onPress={() => onShoot(slot.id)}
                >
                  <ThemedText selectable={false} type="note" themeColor="primary">
                    지금 찍기
                  </ThemedText>
                </Pressable>
                {filled.isDropped ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.label} 되돌리기`}
                    hitSlop={8}
                    onPress={() => onRestore(slot.id)}
                  >
                    <ThemedText selectable={false} type="note" themeColor="textSecondary">
                      되돌리기
                    </ThemedText>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </View>

      {/* Order first, then removal — the two things done to a row that already has
          a snap. An empty row has nothing to move or clear, so it gets neither. */}
      {snap ? (
        <View style={styles.controls}>
          <View style={styles.arrows}>
            <MoveButton
              label={`${slot.label} 위로`}
              icon="chevron-up"
              enabled={canMoveUp}
              onPress={() => onMove(index, -1)}
            />
            <MoveButton
              label={`${slot.label} 아래로`}
              icon="chevron-down"
              enabled={canMoveDown}
              onPress={() => onMove(index, 1)}
            />
          </View>

          {confidence !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${slot.label} 컷 빼기`}
              hitSlop={ControlHitSlop}
              onPress={() => onDrop(slot.id)}
              style={styles.control}
            >
              <Ionicons color={theme.textSecondary} name="close" size={IconSize} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * What the column of numbers measures, in the fewest words that stay true.
 *
 * Neither reading is a claim about the picture: the app has not looked at it,
 * and the server that has is scoring a *position*, not naming a subject.
 */
export function confidenceLabel(kind: ConfidenceKind): string {
  return kind === 'slot-fit' ? '슬롯 적합도' : '같은 외출 확신';
}

type MoveButtonProps = {
  label: string;
  icon: 'chevron-up' | 'chevron-down';
  enabled: boolean;
  onPress: () => void;
};

/** Kept drawn but dimmed when it cannot fire, so the control column never reflows. */
function MoveButton({ label, icon, enabled, onPress }: MoveButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={ControlHitSlop}
      onPress={onPress}
      style={[styles.control, { opacity: enabled ? 1 : 0.3 }]}
    >
      <Ionicons color={theme.textSecondary} name={icon} size={IconSize} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    padding: Spacing.one,
  },
  frame: {
    width: FrameSize,
    height: FrameSize,
    borderRadius: Radius.xsmall,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  placeholder: {
    width: FrameSize,
    height: FrameSize,
    borderRadius: Radius.xsmall,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: Spacing.one, justifyContent: 'center' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The percentage stays pushed to the far edge even though it is now bare.
    // Sitting flush against the label, `골목 70%` reads as "70% sure this is an
    // alley" — the one claim the match cannot make.
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.half },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  arrows: { gap: Spacing.half },
  control: {
    width: ControlSize,
    height: ControlSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
