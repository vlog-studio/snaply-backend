import { Ionicons } from '@expo/vector-icons';
import { useRouter, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTemplateOffers } from '@/features/fill-template';
import { formatDuration } from '@/shared/lib/datetime';
import { movieHref, snapPickerHref } from '@/shared/routes';
import { FadeInView } from '@/shared/ui/fade-in-view';
import {
  MaxContentWidth,
  Radius,
  Spacing,
  useTabBarHeight,
  useTheme,
  useTopContentInset,
} from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';
import { MovieRow, useBoardMovies } from '@/widgets/movie-shelf';
import { useSnapDays } from '@/widgets/snap-grid';

import { TemplatePanel } from './template-panel';

/** How many movies the board previews before deferring to the movie tab. */
const BoardPreviewCount = 3;

/**
 * How many of the newest snaps the 새 무비 row shows. The row always lays out
 * this many cells, so a library of two draws two cells of the same size as a
 * library of two hundred — a strip whose cells grew to fill the row would look
 * like a different control.
 */
const RecentSnapCount = 5;

/**
 * The studio — the workbench the app opens on.
 *
 * Three blocks, read top to bottom as start → work: the way into a new movie,
 * the templates that will go looking for material on their own, and the movies
 * themselves — unfinished first. Reopening the app lands here so the user
 * resumes rather than restarts (concept §3).
 *
 * The 새 무비 row and the templates are two entrances to the same place: one is
 * "make a movie out of these", the other is "make me something like this". Both
 * show the user's own material rather than describing it: the row carries the
 * library's size and its newest snaps, the template cards their filled and empty
 * slots — the workbench has the material on it (concept §3). The
 * row replaced the 담기 트레이 panel (2026-08-12): picks now become a draft
 * movie directly, and a draft is the basket the tray was — persistent, refill-
 * able through the movie screen, and plural — so the studio's job here shrank
 * to offering the way in, at the one-row weight the empty tray had already
 * settled on.
 */
export function StudioPage() {
  const theme = useTheme();
  const router = useRouter();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();

  // Tapping the tab that is already open returns to the top. Switching tabs
  // keeps each tab's scroll position, which is what the shell's four tabs are
  // for — so re-tapping is the reset, as it is on a native tab bar.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const templateOffers = useTemplateOffers();
  const boardMovies = useBoardMovies();
  const library = useSnapDays();
  // Newest first, as the Snap tab draws them. Held back until the store has
  // read itself back, so a full library never flashes as an empty one; with no
  // snaps the row keeps its one-line shape — there is nothing to show yet.
  const hasMaterial = library.isHydrated && library.totalCount > 0;
  const recentSnaps = hasMaterial
    ? library.days.flatMap((day) => day.snaps).slice(0, RecentSnapCount)
    : [];

  const pickSnaps = () => router.push(snapPickerHref());
  // Every movie opens on the same screen, whatever it is waiting for: watching a
  // finished one and fixing it happen in the same place.
  const openMovie = (movieId: string) => router.push(movieHref(movieId));

  const openTemplate = (templateId: string) =>
    router.push({ pathname: '/template/[id]', params: { id: templateId } });

  return (
    <ScrollView
      ref={scrollRef}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Spacing.six + topInset, paddingBottom: Spacing.seven + tabBarHeight },
      ]}
    >
      <View style={styles.header}>
        <ThemedText type="title">스튜디오</ThemedText>
      </View>

      <FadeInView duration={260} style={styles.blocks}>
        {/* One block, whole-block tappable: picking the snaps is the first
            real decision of a hand-made movie, and it happens on the Snap tab.
            The frames are what there is to pick from, not targets of their
            own — one tap target keeps them from reading as separate buttons. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            hasMaterial
              ? `스냅 골라서 새 무비 만들기 · 스냅 ${library.totalCount}개`
              : '스냅 골라서 새 무비 만들기'
          }
          onPress={pickSnaps}
          style={({ pressed }) => [
            styles.newMovie,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.newMovieHead}>
            <View style={styles.newMovieTitle}>
              <ThemedText selectable={false} type="smallBold">
                스냅 골라 새 무비
              </ThemedText>
              {hasMaterial ? (
                // The Snap tab's own header read-out, so the two never disagree.
                <ThemedText selectable={false} type="note" themeColor="textSecondary">
                  {library.totalCount}개 · {formatDuration(library.totalDurationSec)}
                </ThemedText>
              ) : null}
            </View>
            <Ionicons color={theme.textSecondary} name="chevron-forward" size={16} />
          </View>
          {hasMaterial ? (
            <View style={styles.recentRow}>
              {Array.from({ length: RecentSnapCount }, (_, index) => {
                const snap = recentSnaps[index];
                return snap ? (
                  <View key={snap.id} style={[styles.recentCell, { borderColor: theme.border }]}>
                    <VideoFrame uri={snap.uri} />
                  </View>
                ) : (
                  <View key={`empty-${index}`} style={styles.recentCell} />
                );
              })}
            </View>
          ) : null}
        </Pressable>

        <TemplatePanel offers={templateOffers} onOpen={openTemplate} />

        {/* No movies yet means no board: a heading over a dashed sentence that
            says the list is empty adds a block without adding a fact. The two
            entrances above are what an empty studio has to offer. */}
        {boardMovies.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <ThemedText type="smallBold">무비</ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="무비 전체 보기"
                hitSlop={8}
                onPress={() => router.navigate('/movies')}
              >
                <ThemedText selectable={false} type="note" themeColor="primary">
                  전체 보기
                </ThemedText>
              </Pressable>
            </View>
            {boardMovies.slice(0, BoardPreviewCount).map((movie) => (
              <MovieRow key={movie.id} movie={movie} onPress={openMovie} />
            ))}
          </View>
        ) : null}
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.five,
  },
  header: { gap: Spacing.half },
  blocks: { gap: Spacing.five },
  // The one-row weight the empty tray panel had settled on is still the shape
  // of an empty library; the frames below it only arrive with snaps.
  newMovie: {
    minHeight: 52,
    justifyContent: 'center',
    gap: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  newMovieHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  newMovieTitle: { flex: 1, gap: Spacing.half },
  recentRow: { flexDirection: 'row', gap: Spacing.two },
  // Square, as in the Snap tab's grid: a frame only has to be recognizable.
  recentCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  section: { gap: Spacing.two },
  sectionHead: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
