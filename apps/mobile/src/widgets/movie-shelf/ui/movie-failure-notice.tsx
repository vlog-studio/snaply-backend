import { Pressable, StyleSheet, View } from 'react-native';

import { useComposeMovie } from '@/features/compose-movie';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type MovieFailureNoticeProps = {
  movieId: string;
  /** Why the last attempt broke; a fallback is shown when the store has none. */
  error: string | undefined;
  /** Cuts the movie still holds. Nothing to run means nothing to retry. */
  snapCount: number;
  /**
   * Where it is drawn. A grid tile clamps the reason to one line so every cell
   * in a row keeps the same height; a board row lets it wrap, having the width
   * for it.
   */
  variant?: 'row' | 'tile';
};

const UnknownError = '알 수 없는 이유로 생성이 멈췄어요.';

/**
 * A failed movie's way back: what went wrong, and running it again.
 *
 * Lives in the widget rather than in either page because the board row and the
 * grid tile must offer the same recovery — a failure the user can only undo from
 * one of the two places they see it is a failure they will get stuck on. Holding
 * the action here also keeps it one behavior instead of two wirings that can
 * drift.
 *
 * Retrying is refused rather than offered when the movie has no cuts left: that
 * is the one failure the app can produce today, and a retry would fail again
 * immediately. The card itself opens the movie, which is where cuts come back.
 *
 * In the grid the reason is clamped to one line (2026-08-13). The backend words
 * it, so it can run to any length, and a wrapped sentence in one two-column cell
 * made its whole row taller than the tiles beside it — a grid is scanned, and a
 * cell that grows by its content breaks the scan. The reason is not lost: the
 * movie screen's footer states it in full, and the tile still carries the 실패
 * badge and the retry that is the point of this notice.
 */
export function MovieFailureNotice({
  movieId,
  error,
  snapCount,
  variant = 'row',
}: MovieFailureNoticeProps) {
  const theme = useTheme();
  const { startGeneration } = useComposeMovie();

  return (
    <View style={[styles.notice, { borderColor: theme.danger }]}>
      <ThemedText
        type="note"
        themeColor="danger"
        numberOfLines={variant === 'tile' ? 1 : undefined}
      >
        {error ?? UnknownError}
      </ThemedText>
      {snapCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="생성 다시 시도"
          hitSlop={8}
          // A refusal here has nowhere to be shown — this notice is one line on a
          // card — so a retry that cannot start simply leaves the movie failed,
          // with the reason it already carries. The movie screen is where a
          // refusal is answered.
          onPress={() => void startGeneration(movieId)}
          style={({ pressed }) => [
            styles.retry,
            { borderColor: theme.primary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText selectable={false} type="note" themeColor="primary">
            다시 시도
          </ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="note" themeColor="textSecondary" numberOfLines={1}>
          무비를 열어 스냅을 다시 넣어주세요.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.half,
    alignItems: 'flex-start',
  },
  retry: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
});
