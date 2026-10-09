import { Pressable, StyleSheet, View } from 'react-native';

import type { CutsRefusal } from '@/features/compose-movie';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/** Why a cut edit was refused, in the user's words. */
export const CutsRefusalMessages: Record<CutsRefusal, string> = {
  empty: '컷이 최소 1개는 있어야 해요.',
  full: '한 편에 들어가는 스냅 수를 넘었어요.',
  frozen: '만드는 동안에는 컷을 고칠 수 없어요.',
};

/**
 * The `busy` refusal's way to the movie being made — the run can be watched to
 * its end or canceled there. A run refusal's own words are
 * `generationRefusalMessage` (`features/compose-movie`), shared with the
 * failed-movie card.
 */
export const OpenGeneratingMovieLabel = '만드는 중인 무비 보기';

/** The one thing a refusal lets the user do about it, worded as its outcome. */
export type RefusalAction = {
  label: string;
  onPress: () => void;
};

/**
 * The line that answers a refusal — one component for both places on this
 * screen a refusal surfaces.
 *
 * A refused edit is normally answered in the footer, under the button that
 * refused it; while a job owns the movie the footer is gone, and the refusal
 * still has to be answered. Wording the same rule in two files is how two
 * surfaces come to disagree about it, which the rules the refusals stand for
 * (`features/compose-movie`) exist to prevent.
 *
 * A refusal the user can resolve somewhere else carries the way there under
 * the line (`action`), drawn as the footer's other in-notice action is — a
 * link, not a second button competing with the one that refused.
 */
export function RefusalNotice({ message, action }: { message: string; action?: RefusalAction }) {
  const theme = useTheme();

  return (
    <View
      style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.warmSurface }]}
    >
      <ThemedText type="small">{message}</ThemedText>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText selectable={false} type="smallBold" themeColor="primary">
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.one,
  },
  action: { alignSelf: 'flex-start' },
});
