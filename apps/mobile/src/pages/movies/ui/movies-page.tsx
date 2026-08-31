import { useIsFocused, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useDeleteMovie, useMovieById } from '@/entities/movie';
import { useRenderSource } from '@/features/compose-movie';
import { useShareMovie } from '@/features/share-movie';
import { movieHref, snapPickerHref } from '@/shared/routes';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { useSetTabBarHidden } from '@/shared/ui/tab-bar-chrome';
import {
  MaxContentWidth,
  Radius,
  Spacing,
  useTabBarHeight,
  useTheme,
  useTopContentInset,
} from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { MovieTile, useMovieSummaries, type MovieSummary } from '@/widgets/movie-shelf';

import { MovieDeleteConfirm } from './movie-delete-confirm';
import { MovieSelectionBar } from './movie-selection-bar';

/** Two columns, as in the mockup: a square cover wants the width. */
const Columns = 2;

/**
 * The movie tab — every movie, drafts included, most recent work first.
 *
 * Drafts sit in the same grid as finished movies rather than in a separate
 * section: they are the same object at a different point in its life, and the
 * status badge is what distinguishes them.
 *
 * An empty library offers the way to fill it (2026-08-13): the same act the
 * studio's 새 무비 row starts, in the same words and to the same screen. A tab
 * whose empty state only states that it is empty makes the user go and find the
 * entrance somewhere else, which is the one thing an empty state must not do.
 *
 * Acting on movies is selection mode, the same shape as the snap library: a
 * long press (or the header's 선택) selects instead of opening a sheet, taps
 * toggle, and the bar at the bottom carries the acts. Delete works on any
 * number; share appears in the bar while exactly one movie with a rendered
 * file is selected. This replaced the long-press actions sheet — the sheet's
 * backdrop took the whole grid away exactly when the user was comparing
 * movies to decide which ones to act on. Renaming is not a grid act at all:
 * it lives on the movie screen, beside the title it edits.
 */
export function MoviesPage() {
  const theme = useTheme();
  const router = useRouter();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();
  const { width: windowWidth } = useWindowDimensions();
  const movies = useMovieSummaries();
  const deleteMovie = useDeleteMovie();
  const setTabBarHidden = useSetTabBarHidden();
  const isFocused = useIsFocused();

  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Snapshot of the selection the delete sheet talks about. Taken as the sheet
  // opens so its words hold still through the close animation, when the picks
  // it named are already gone.
  const [deleteTargets, setDeleteTargets] = useState<MovieSummary[]>([]);

  // The one movie the single-selection act (share) is about.
  const soleSelected = picked.length === 1 ? movies.find((m) => m.id === picked[0]) : undefined;
  const soleMovie = useMovieById(soleSelected?.id);
  // Sharing needs the render resolved to a fresh address — the stored one is a
  // signed link that expires (see `useRenderSource`).
  const sharing = useShareMovie(soleMovie, useRenderSource(soleMovie));

  // Re-tapping the 무비 tab returns to the newest movies; switching tabs keeps
  // the grid where the user left it. Selection mode takes the tab bar away
  // entirely, so there is no tab to re-tap while picks are in progress.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const toggle = (movieId: string) => {
    setPicked((current) =>
      current.includes(movieId) ? current.filter((id) => id !== movieId) : [...current, movieId],
    );
  };

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setPicked([]);
  }, []);

  // Android hardware back leaves selection mode instead of leaving the tab.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exitSelection();
      return true;
    });
    return () => subscription.remove();
  }, [selecting, exitSelection]);

  // Selection swaps the bottom chrome: the tab bar and the capture button out,
  // the MovieSelectionBar in — the same trade the snap library makes, for the
  // same reason: the navigator paints its bar above every scene, so without
  // this the tab items cover the selection bar's actions and take its taps.
  // Focus belongs in the condition — this tab stays mounted if something
  // navigates away mid-selection, and a hidden bar on a screen whose selection
  // bar is not on display would leave the app with no bottom chrome at all.
  useEffect(() => {
    if (!selecting || !isFocused) return;
    setTabBarHidden(true);
    return () => setTabBarHidden(false);
  }, [selecting, isFocused, setTabBarHidden]);

  const handlePress = (movieId: string) => {
    if (selecting) toggle(movieId);
    // One destination for every status: the movie screen is where a finished
    // movie is watched and where an unfinished one is run.
    else router.push(movieHref(movieId));
  };

  const handleLongPress = (movie: MovieSummary) => {
    if (selecting) return;
    setSelecting(true);
    setPicked([movie.id]);
  };

  const openDelete = () => {
    setDeleteTargets(movies.filter((movie) => picked.includes(movie.id)));
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    // Synchronous store writes: a movie is only a composition, so nothing on
    // disk goes with it — the snap originals belong to the snaps.
    for (const movie of deleteTargets) deleteMovie(movie.id);
    setDeleteOpen(false);
    exitSelection();
  };

  const share = () => {
    sharing.share();
    exitSelection();
  };

  // Derived instead of measured (the content column is centered, capped at
  // MaxContentWidth, and padded) so the tiles lay out on their first frame.
  const gridWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.five * 2;
  const tileWidth = Math.floor((gridWidth - Spacing.three * (Columns - 1)) / Columns);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.six + topInset,
            paddingBottom: Spacing.seven + (selecting ? SelectionBarRoom : tabBarHeight),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <ThemedText type="title">무비</ThemedText>
              {/* "모두" because the grid holds drafts and failures too: a bare
                  count under a 무비 heading reads as a count of finished ones,
                  and the number would then contradict what the tiles say. */}
              <ThemedText type="small" themeColor="textSecondary">
                모두 {movies.length}편
              </ThemedText>
            </View>
            {movies.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selecting ? '선택 취소' : '무비 선택'}
                hitSlop={12}
                onPress={() => (selecting ? exitSelection() : setSelecting(true))}
                style={styles.headerAction}
              >
                <ThemedText selectable={false} type="smallBold" themeColor="primary">
                  {selecting ? '취소' : '선택'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>

        {movies.length > 0 ? (
          <View style={styles.grid}>
            {movies.map((movie) => (
              <MovieTile
                key={movie.id}
                movie={movie}
                width={tileWidth}
                selecting={selecting}
                selected={picked.includes(movie.id)}
                onPress={handlePress}
                // The acts live here rather than on the movie screen: the grid
                // is where all the movies stand side by side, which is where
                // one is noticed as misnamed, worth sending, or redundant.
                // Same gesture as the snap grid — a long press is how this app
                // acts on a thing instead of opening it.
                onLongPress={handleLongPress}
              />
            ))}
          </View>
        ) : (
          // An empty library still has to offer the one act that fills it:
          // without this the tab is a dead end, and making a movie means
          // knowing to go and find the studio's own entrance. Same act, same
          // destination, and the same words the studio uses for it — this is a
          // second door, not a second feature.
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <ThemedText type="heading">아직 만든 무비가 없어요</ThemedText>
            <SnaplyButton
              accessibilityLabel="스냅 골라서 새 무비 만들기"
              title="스냅 골라 새 무비"
              onPress={() => router.push(snapPickerHref())}
              style={styles.emptyAction}
            />
          </View>
        )}
      </ScrollView>

      {selecting ? (
        <MovieSelectionBar
          selectedCount={picked.length}
          shareBlock={sharing.blocked}
          shareBusy={sharing.busy}
          onShare={share}
          onDelete={openDelete}
          onClear={() => setPicked([])}
        />
      ) : null}

      <BottomSheet
        accessibilityLabel="무비 삭제 확인"
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      >
        <MovieDeleteConfirm
          movies={deleteTargets}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={confirmDelete}
        />
      </BottomSheet>
    </View>
  );
}

// Room the selection bar takes at the bottom of the scroll: its two rows plus
// the safe-area padding it adds itself.
const SelectionBarRoom = 132;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.five,
  },
  header: { gap: Spacing.half },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleText: { gap: Spacing.half },
  headerAction: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    padding: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
  },
  // Wide enough to read as the block's action rather than as a chip, without
  // stretching to the dashed border it sits inside.
  emptyAction: { alignSelf: 'stretch', marginTop: Spacing.one },
});
