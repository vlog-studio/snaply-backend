import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMovieTemplate } from '@/entities/movie-template';
import { useSnaps } from '@/entities/snap';
import { useComposeMovie } from '@/features/compose-movie';
import { useTemplateFill } from '@/features/fill-template';
import { formatSeconds } from '@/shared/lib/datetime';
import { movieHref } from '@/shared/routes';
import { BackBar } from '@/shared/ui/back-bar';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { SlotRow, confidenceLabel } from './slot-row';

export type MovieTemplatePageProps = {
  templateId?: string;
};

/**
 * A template with the library matched against it: which scenes it already has,
 * which are missing, and the one button that turns the result into a movie.
 *
 * The match runs on time and place and says so; it never claims to have
 * recognised what is in a shot (`features/fill-template`). What it is really for
 * is the empty rows — a slot the library cannot fill is the app telling the user
 * what to go and shoot, and `지금 찍기` walks them to the camera and puts the
 * result in that exact row on the way back.
 *
 * Making the movie lands on an editable draft rather than starting generation:
 * generation is slow remote work once a real backend runs it, so the movie
 * screen is where the user settles the cut lengths and the style first and then
 * pays for the run once. This screen only gathers the material.
 */
export function MovieTemplatePage({ templateId }: MovieTemplatePageProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snaps = useSnaps();
  const template = useMovieTemplate(templateId);
  const fill = useTemplateFill(template);
  const { fillSlot } = fill;
  const { startMovieFromTemplate } = useComposeMovie();
  const [error, setError] = useState<string>();

  // Which row sent the user to the camera, and what the newest snap was when
  // they left. Refs rather than state: nothing renders from them, and they must
  // survive the trip without re-running the effect that reads them.
  const pending = useRef<{ slotId: string; latestSnapId?: string }>(undefined);

  useFocusEffect(
    useCallback(() => {
      const request = pending.current;
      if (!request) return;
      const newest = snaps[0];
      // A capture prepends to the library, so a different newest snap is the one
      // that was just shot. Coming back without shooting leaves the slot empty.
      if (newest && newest.id !== request.latestSnapId) {
        fillSlot(request.slotId, newest);
      }
      pending.current = undefined;
    }, [snaps, fillSlot]),
  );

  // A direct link can land here with nothing behind it, and the screen has no
  // navigation bar to fall back on — so going back means the studio.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!template) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <BackBar onPress={goBack} />
        <View style={[styles.screen, styles.centered]}>
          <ThemedText type="heading">템플릿을 찾을 수 없어요</ThemedText>
          <ThemedText themeColor="textSecondary">이미 사라졌거나 잘못된 주소예요.</ThemedText>
        </View>
      </View>
    );
  }

  const shootFor = (slotId: string) => {
    pending.current = { slotId, latestSnapId: snaps[0]?.id };
    router.push('/capture');
  };

  const makeMovie = () => {
    const movie = startMovieFromTemplate({
      snapIds: fill.snapIds,
      style: template.style,
      bgm: template.bgm,
    });
    if (!movie) {
      setError('채워진 컷이 하나도 없어요. 빈 자리를 찍어서 채워주세요.');
      return;
    }
    router.replace(movieHref(movie.id));
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <BackBar onPress={goBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Spacing.seven }]}>
        <View style={styles.header}>
          <ThemedText type="title">{template.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {template.description} · {template.slots.length}컷
          </ThemedText>
        </View>

        {/* The percentages have no label of their own — one heading over the
            column they sit in says what they measure, without repeating a
            constant down every row. Absent when no row shows a number. */}
        {fill.slots.some((filled) => filled.confidence !== undefined) ? (
          <View style={styles.legend}>
            <ThemedText selectable={false} type="note" themeColor="textSecondary">
              {confidenceLabel(fill.confidenceKind)}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.slots}>
          {fill.slots.map((filled, index) => (
            <SlotRow
              key={filled.slot.id}
              filled={filled}
              confidenceKind={fill.confidenceKind}
              index={index}
              onShoot={shootFor}
              onDrop={fill.dropSlot}
              onRestore={fill.restoreSlot}
              onMove={fill.moveSnap}
            />
          ))}
        </View>

        {fill.isEdited ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="고친 것 되돌리기"
            hitSlop={8}
            onPress={fill.resetSlots}
            style={styles.reset}
          >
            <ThemedText selectable={false} type="note" themeColor="textSecondary">
              고친 것 되돌리기
            </ThemedText>
          </Pressable>
        ) : null}

        {error ? (
          <View
            style={[
              styles.notice,
              { borderColor: theme.border, backgroundColor: theme.warmSurface },
            ]}
          >
            <ThemedText type="small">{error}</ThemedText>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + Spacing.four,
          },
        ]}
      >
        <View style={styles.footerHead}>
          <ThemedText type="small" themeColor="textSecondary">
            {fill.filledCount} / {template.slots.length}칸 채움
          </ThemedText>
          <ThemedText type="note" themeColor="textSecondary">
            {formatSeconds(fill.totalSec)}
          </ThemedText>
        </View>
        <SnaplyButton
          title={
            fill.filledCount === template.slots.length
              ? '이대로 만들기'
              : `${fill.filledCount}컷으로 만들기`
          }
          variant="ai"
          disabled={fill.filledCount === 0}
          onPress={makeMovie}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.six,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    // The back arrow above carries its own padding, so the title needs only the
    // gap that keeps it off the glyph.
    paddingTop: Spacing.two,
    gap: Spacing.four,
  },
  header: { gap: Spacing.half },
  legend: { alignItems: 'flex-end', paddingHorizontal: Spacing.one },
  slots: { gap: Spacing.one },
  reset: { alignSelf: 'center', paddingVertical: Spacing.one },
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  footerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
