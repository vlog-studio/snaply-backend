import { Pressable, StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import type { MovieSummary } from '@/widgets/movie-shelf';

export type MovieDeleteConfirmProps = {
  /** The movies the step talks about — the grid's current selection. */
  movies: MovieSummary[];
  onCancel: () => void;
  onConfirm: () => void;
};

/** How many of the selection are named before the rest fold into "외 N편". */
const NamedLimit = 3;

/**
 * Confirms deleting the selected movies, and says what stays. Content only,
 * drawn inside the sheet the movie grid opens over its selection.
 *
 * The reverse of the snap sheet: deleting a snap destroys the one thing every
 * movie built on it needs, so that sheet lists the damage — but a movie is only
 * a composition over snaps it never owned, so this step's job is reassurance,
 * naming what it takes and promising the originals survive. The one real loss
 * worth a warning of its own is a job in flight, which dies with the movie
 * that carries it.
 */
export function MovieDeleteConfirm({ movies, onCancel, onConfirm }: MovieDeleteConfirmProps) {
  const theme = useTheme();
  const named = movies.slice(0, NamedLimit);
  const restCount = movies.length - named.length;
  const generatingCount = movies.filter((movie) => movie.status === 'generating').length;

  const confirmLabel = movies.length === 1 ? `${movies[0].title} 삭제` : `${movies.length}편 삭제`;

  return (
    <View style={styles.step}>
      <ThemedText type="note" themeColor="danger">
        무비 삭제
      </ThemedText>
      <ThemedText type="heading">
        {movies.length === 1 ? '이 무비를 지울까요?' : `무비 ${movies.length}편을 지울까요?`}
      </ThemedText>

      <View style={[styles.movies, { borderColor: theme.border }]}>
        {named.map((movie, index) => (
          <View
            key={movie.id}
            style={[
              styles.movieRow,
              index > 0 ? [styles.movieDivider, { borderTopColor: theme.border }] : null,
            ]}
          >
            <ThemedText type="smallBold" numberOfLines={1}>
              {movie.title}
            </ThemedText>
            <ThemedText type="note" themeColor="textSecondary">
              컷 {movie.snapCount} · {formatSeconds(movie.totalSec)}
            </ThemedText>
          </View>
        ))}
        {restCount > 0 ? (
          <View style={[styles.movieRow, styles.movieDivider, { borderTopColor: theme.border }]}>
            <ThemedText type="note" themeColor="textSecondary">
              외 {restCount}편
            </ThemedText>
          </View>
        ) : null}
      </View>

      <ThemedText themeColor="textSecondary">
        컷 구성과 완성 기록이 함께 사라져요. 스냅 원본 영상은 그대로 남아요.
      </ThemedText>

      {generatingCount > 0 ? (
        <ThemedText type="small" themeColor="danger">
          지금 만드는 중인 작업도 함께 사라져요.
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제 취소"
          onPress={onCancel}
          style={[styles.action, { borderColor: theme.border }]}
        >
          <ThemedText selectable={false} type="button">
            취소
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.danger,
              borderColor: theme.danger,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            삭제
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: Spacing.three },
  movies: {
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
  },
  movieRow: { paddingVertical: Spacing.two, gap: Spacing.half },
  movieDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  action: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
