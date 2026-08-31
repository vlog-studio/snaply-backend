import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Movie } from '@/entities/movie';
import type { CutsRefusal } from '@/features/compose-movie';
import type { MovieSharing } from '@/features/share-movie';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { CutsRefusalMessages, RefusalNotice } from './refusal-notice';

export type GenerateFooterProps = {
  movie: Movie;
  /** Cuts the movie holds; nothing to generate is a refusal, not a run. */
  cutCount: number;
  /**
   * Why the last attempt to start was refused, already in the user's words — the
   * page resolves it, because one of the refusals is worded by the backend and
   * this footer cannot tell that one from the rest.
   */
  refusalMessage: string | undefined;
  /** Why the last cut edit was refused, if it was. */
  cutsRefusal: CutsRefusal | undefined;
  /**
   * True on a finished movie whose cut list drifted from what its render was
   * made from — the one state where what plays is not what was made.
   */
  editedSinceRender: boolean;
  /** Puts the cut list back to the render's own composition. */
  onRestoreCuts: () => void;
  sharing: MovieSharing;
  /**
   * The selected cut's controls, standing in for the action row while a cut
   * is held. The notices above the slot stay either way — a refused cut edit
   * has to be answered exactly while a cut is selected.
   */
  inspector?: ReactNode;
  onStart: () => void;
};

/**
 * Handing the movie to the AI — the fixed bar under the timeline (concept §6
 * step ③). The first run, a retry after a failure, and a remake after an edit
 * are the same act on the same button; what changes is the label and, for a
 * failure, the stored reason above it.
 *
 * The action row is a fixed-height slot: while a cut is selected it hands its
 * place to the cut inspector instead of stacking above or below it, so taking
 * and releasing a cut never changes this zone's height — the stage above is
 * sized by what the zones below leave over, and a row that came and went made
 * the video jump. Deselecting (a tap on the strip's empty space) brings the
 * generate button back.
 *
 * The button and what refused it, and nothing else. A summary line under it
 * used to restate the configuration (컷 수, 길이, 스타일, 음악) and the standing
 * caveats about how long a run takes and how little it really does; on a screen
 * whose stage lives on leftover height, three lines of prose that the strip, the
 * chips, and the progress panel each already say cost more than they told.
 */
export function GenerateFooter({
  movie,
  cutCount,
  refusalMessage,
  cutsRefusal,
  editedSinceRender,
  onRestoreCuts,
  sharing,
  inspector,
  onStart,
}: GenerateFooterProps) {
  const theme = useTheme();
  const hasFailed = movie.status === 'failed';
  const isReady = movie.status === 'ready';

  return (
    <View style={styles.footer}>
      {/* An edited finished movie says so: the stage is playing the changed
          composition, not the one that was made, and only 다시 만들기 closes
          that gap. The restore is the one-tap way back when the edit was a
          mis-tap — screen-local undo dies with the visit, this does not. */}
      {isReady && editedSinceRender ? (
        <View style={[styles.notice, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            완성한 뒤에 컷 구성이 달라졌어요. 다시 만들기 전까지는 바뀐 구성으로 재생돼요.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="완성 당시 구성으로 되돌리기"
            onPress={onRestoreCuts}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.restore, { opacity: pressed ? 0.7 : 1 }]}
          >
            <ThemedText selectable={false} type="smallBold" themeColor="primary">
              완성 당시 구성으로 되돌리기
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {hasFailed ? (
        // The stored reason, not a generic apology: the user has to know
        // whether running it again is worth anything, and today's one failure
        // is only answered by putting cuts back first. The server's own
        // diagnostic, when one was kept, rides under it demoted — it is what a
        // bug report needs, not what the failure means.
        <View style={[styles.notice, { borderColor: theme.danger }]}>
          <ThemedText type="small" themeColor="danger">
            {movie.error ?? '알 수 없는 이유로 생성이 멈췄어요.'}
          </ThemedText>
          {movie.errorDetail ? (
            <ThemedText type="note" themeColor="textSecondary">
              {movie.errorDetail}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {cutsRefusal ? <RefusalNotice message={CutsRefusalMessages[cutsRefusal]} /> : null}

      {refusalMessage ? <RefusalNotice message={refusalMessage} /> : null}

      <View style={styles.actionSlot}>
        {inspector ?? (
          <View style={styles.actions}>
            {isReady ? (
              <SnaplyButton
                title={sharing.busy ? '공유 준비 중…' : '공유'}
                variant="secondary"
                disabled={sharing.blocked !== undefined || sharing.busy}
                onPress={sharing.share}
                style={styles.share}
              />
            ) : null}
            <SnaplyButton
              title={
                hasFailed ? '다시 시도' : isReady ? '이 구성으로 다시 만들기' : 'AI로 생성 시작'
              }
              variant="ai"
              disabled={cutCount === 0}
              onPress={onStart}
              style={styles.generate}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: Spacing.two },
  // One button tall (`SnaplyButton` minHeight), whichever occupant is in.
  actionSlot: { minHeight: 56, justifyContent: 'center' },
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.one,
  },
  restore: { alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  share: { flexBasis: '32%' },
  generate: { flex: 1 },
});
