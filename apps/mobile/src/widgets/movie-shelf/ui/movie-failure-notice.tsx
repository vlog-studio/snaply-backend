import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { generationRefusalHeadline, useComposeMovie } from '@/features/compose-movie';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type MovieFailureNoticeProps = {
  movieId: string;
  /** Why the last attempt broke; a fallback is shown when the store has none. */
  error: string | undefined;
  /** Cuts the movie still holds. Nothing to run means nothing to retry. */
  snapCount: number;
  /**
   * Where it is drawn. A grid tile clamps its line to one so every cell in a
   * row keeps the same height; a board row lets it wrap, having the width for
   * it.
   */
  variant?: 'row' | 'tile';
};

const UnknownError = '무비를 만들지 못했어요.';

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
 * A retry that cannot start is answered on the card, in the line the reason
 * held: what refused it, in one sentence (`generationRefusalHeadline`) — another
 * movie being made, a cut still uploading, a short balance. Pressing and seeing
 * nothing happen is the one answer a press must never get, and since one movie
 * is made at a time (MOV-11) a refused retry is ordinary. The refusal takes the
 * reason's place rather than joining it, so a tile does not grow; the reason
 * is not lost — the 실패 badge stays, and the movie screen states it in full,
 * along with the rest of the refusal and its way out. The line stands until the
 * next press is answered, as the movie screen's does. A `busy` refusal needs no
 * link here: the movie being made is on the same list.
 *
 * In the grid the line is clamped to one (2026-08-13). A wrapped sentence in one
 * two-column cell made its whole row taller than the tiles beside it — a grid
 * is scanned, and a cell that grows by its content breaks the scan.
 */
export function MovieFailureNotice({
  movieId,
  error,
  snapCount,
  variant = 'row',
}: MovieFailureNoticeProps) {
  const theme = useTheme();
  const { startGeneration } = useComposeMovie();
  const [refusal, setRefusal] = useState<string>();
  // One start at a time: a second press while the first is in flight would be
  // refused by the first one's own run and report it as someone else's.
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const clampLines = variant === 'tile' ? 1 : undefined;

  const retry = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const outcome = await startGeneration(movieId);
      // A started run leaves `failed`, and this notice with it.
      setRefusal(
        outcome.refused ? generationRefusalHeadline(outcome.refused, outcome.shortfall) : undefined,
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  return (
    <View style={[styles.notice, { borderColor: theme.danger }]}>
      {refusal ? (
        <ThemedText type="note" numberOfLines={clampLines}>
          {refusal}
        </ThemedText>
      ) : (
        <ThemedText type="note" themeColor="danger" numberOfLines={clampLines}>
          {error ?? UnknownError}
        </ThemedText>
      )}
      {snapCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 만들기"
          accessibilityState={{ disabled: starting }}
          disabled={starting}
          hitSlop={8}
          onPress={() => void retry()}
          style={({ pressed }) => [
            styles.retry,
            { borderColor: theme.primary, opacity: starting ? 0.45 : pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText selectable={false} type="note" themeColor="primary">
            다시 시도
          </ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="note" themeColor="textSecondary" numberOfLines={1}>
          무비를 열어 스냅을 다시 넣어 주세요.
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
