import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { ActionRow } from './movie-actions-sheet';

export type EditExitSheetProps = {
  visible: boolean;
  /** Runs the movie again from the edited composition. */
  onRemake: () => void;
  /** Keeps the edited composition stored and returns to watch mode. */
  onKeep: () => void;
  /** Puts the cut list back to the render's composition, then returns. */
  onDiscard: () => void;
  /** Stays in the studio — the backdrop tap and the sheet's dismiss. */
  onClose: () => void;
};

/**
 * The one question on the way out of a finished movie's studio, asked only
 * when edits made since the studio was entered drifted the cut list from what
 * the render was made of. Edits commit as they land, so nothing here is a save
 * prompt — every
 * option leaves a stored list behind; they differ in *which* list and in
 * whether a run starts:
 *
 * - 다시 만들기 — the edited composition becomes the movie, now.
 * - 나중에 만들기 — the edits stay stored; watch mode keeps playing the
 *   render and carries a standing notice about the drift.
 * - 편집 취소 — the render's own composition is written back. Grouped apart
 *   in danger color because the visit's undo history dies with the screen:
 *   past this sheet there is no way to get the edits back.
 *
 * Drift already answered for — an earlier studio entry's, or an earlier
 * visit's — does not reopen this sheet: watch mode's notice keeps standing
 * for it.
 */
export function EditExitSheet({
  visible,
  onRemake,
  onKeep,
  onDiscard,
  onClose,
}: EditExitSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="편집 마치기">
      <View style={styles.step}>
        <ThemedText type="heading">편집을 마칠까요?</ThemedText>
        <ThemedText themeColor="textSecondary">
          완성한 뒤에 컷 구성이 달라졌어요. 다시 만들기 전까지는 완성 당시 구성으로 재생돼요.
        </ThemedText>

        <View style={[styles.group, { borderColor: theme.border }]}>
          <ActionRow icon="sparkles" label="이 구성으로 다시 만들기" onPress={onRemake} />
          <ActionRow icon="time" label="나중에 만들기" divider onPress={onKeep} />
        </View>
        <View style={[styles.group, { borderColor: theme.border }]}>
          <ActionRow icon="arrow-undo" label="편집 취소" danger onPress={onDiscard} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  step: { gap: Spacing.three },
  group: {
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
  },
});
