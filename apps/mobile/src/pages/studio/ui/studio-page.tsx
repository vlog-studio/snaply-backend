import { useRouter, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTemplateOffers } from '@/features/fill-template';
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
import { MovieRow, useBoardMovies } from '@/widgets/movie-shelf';

import { TemplatePanel } from './template-panel';

/** How many movies the board previews before deferring to the movie tab. */
const BoardPreviewCount = 3;

/**
 * The studio — the workbench the app opens on.
 *
 * Three blocks, read top to bottom as start → work: the way into a new movie,
 * the templates that will go looking for material on their own, and the movies
 * themselves — unfinished first. Reopening the app lands here so the user
 * resumes rather than restarts (concept §3).
 *
 * The 새 무비 row and the templates are two entrances to the same place: one is
 * "make a movie out of these", the other is "make me something like this". The
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
        {/* One row, whole-row tappable: picking the snaps is the first real
            decision of a hand-made movie, and it happens on the Snap tab. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스냅 골라서 새 무비 만들기"
          onPress={pickSnaps}
          style={({ pressed }) => [
            styles.newMovieRow,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="smallBold">
            새 무비
          </ThemedText>
          <ThemedText selectable={false} type="smallBold" themeColor="primary">
            스냅 고르기
          </ThemedText>
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
  // The one-row weight the empty tray panel had settled on, kept.
  newMovieRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
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
