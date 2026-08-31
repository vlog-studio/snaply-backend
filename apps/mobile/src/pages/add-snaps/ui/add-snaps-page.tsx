import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MovieSnapLimit, useMovieById } from '@/entities/movie';
import type { Snap } from '@/entities/snap';
import { canEditMovie, useComposeMovie } from '@/features/compose-movie';
import { movieHref } from '@/shared/routes';
import { BackBar } from '@/shared/ui/back-bar';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { SnapDayGrid, SnapSelectionBar, useSnapDays, useSnapPicking } from '@/widgets/snap-grid';

export type AddSnapsPageProps = {
  /** `/movie/[id]/add-snaps` — the movie the picks are headed for. */
  movieId?: string;
};

/**
 * A movie's "스냅 더 넣기": the snap library, always picking, into this movie's
 * cut list.
 *
 * It draws the Snap tab's grid but it is not that tab, and that is the point.
 * This used to be `/snaps?select=1&for=<movieId>`, which made the movie screen
 * push a *tab* route: Expo Router answers that by mounting a second copy of the
 * tab navigator over the movie, and the confirming `router.back()` was then
 * handled by that tab navigator — which switched to its first tab (the studio)
 * instead of returning to the movie the user came from. A screen pushed onto the
 * root stack goes back where it came from, because the stack is what handles the
 * action.
 *
 * Picks go straight into the movie rather than through the tray, which would
 * make the user leave the movie, empty the tray, and come back. Nothing here
 * plays or deletes an original: this screen is one errand, and it ends on the
 * movie.
 */
export function AddSnapsPage({ movieId }: AddSnapsPageProps) {
  const theme = useTheme();
  const router = useRouter();
  // The bar reports its real height (it varies with the safe-area inset, the
  // font scale, and the notice line); the estimate only covers the frames
  // before the first layout.
  const [selectionBarHeight, setSelectionBarHeight] = useState(SelectionBarRoomEstimate);
  const movie = useMovieById(movieId);
  const { days, totalCount, isHydrated } = useSnapDays();
  const { appendSnaps } = useComposeMovie();

  const heldIds = useMemo(
    () => new Set(movie?.snapRefs.map((ref) => ref.snapId) ?? []),
    [movie?.snapRefs],
  );
  const { picked, room, notice, toggle, clear, announce } = useSnapPicking({
    heldIds,
    heldCount: movie?.snapRefs.length ?? 0,
    capacity: MovieSnapLimit,
    describeRefusal: (room) =>
      room === 0
        ? `이 무비는 이미 스냅 ${MovieSnapLimit}개를 갖고 있어요.`
        : `한 편에는 스냅 ${MovieSnapLimit}개까지 들어가요. 지금은 ${room}개만 더 담을 수 있어요.`,
  });

  // Back to the movie this screen belongs to. A direct link can land here with
  // nothing behind it, in which case the movie is where "back" should still go.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (movieId) router.replace(movieHref(movieId));
    else router.replace('/');
  };

  // The movie can go while its picker is open — deleted from the movie tab, or
  // handed to a job that freezes its cut list. Either way there is nothing to
  // add to, and saying so beats a confirming button that quietly refuses.
  if (!movie || !canEditMovie(movie)) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <BackBar onPress={goBack} />
        <View style={[styles.screen, styles.centered]}>
          <ThemedText type="heading">
            {movie ? '지금은 컷을 더 넣을 수 없어요' : '무비를 찾을 수 없어요'}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {movie
              ? '생성이 끝나면 이 무비에 스냅을 더 넣을 수 있어요.'
              : '이미 사라졌거나 잘못된 주소예요.'}
          </ThemedText>
        </View>
      </View>
    );
  }

  const confirmPicks = () => {
    const outcome = appendSnaps(movie.id, picked);
    if (outcome.refused) {
      announce(
        outcome.refused === 'full'
          ? `이 무비에는 ${room}개만 더 넣을 수 있어요.`
          : '이 무비는 더 이상 컷을 고칠 수 없어요.',
      );
      return;
    }
    goBack();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <BackBar onPress={goBack} accessibilityLabel="무비로 돌아가기" title="스냅 더 넣기" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.seven + selectionBarHeight },
        ]}
      >
        <SnapDayGrid
          days={days}
          selecting
          picked={picked}
          heldIds={heldIds}
          onPress={(snap: Snap) => toggle(snap.id)}
        />

        {isHydrated && totalCount === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <ThemedText type="heading">넣을 스냅이 없어요</ThemedText>
          </View>
        ) : null}
      </ScrollView>

      <SnapSelectionBar
        selectedCount={picked.length}
        heldCount={movie.snapRefs.length}
        capacity={MovieSnapLimit}
        targetLabel={movie.title}
        confirmLabel="이 무비에 넣기"
        notice={notice}
        onClear={clear}
        onConfirm={confirmPicks}
        onHeight={setSelectionBarHeight}
      />
    </View>
  );
}

// What the selection bar roughly takes at the bottom of the scroll — only the
// starting value; the bar reports its real height on layout.
const SelectionBarRoomEstimate = 132;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    gap: Spacing.five,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    padding: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
  },
  centerText: { textAlign: 'center' },
});
