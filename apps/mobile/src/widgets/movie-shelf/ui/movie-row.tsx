import { Pressable, StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

import type { MovieSummary } from '../model/use-movie-shelf';
import { MovieFailureNotice } from './movie-failure-notice';
import { MovieStatusBadge, MovieStatusLabels } from './movie-status-badge';

export type MovieRowProps = {
  movie: MovieSummary;
  onPress: (movieId: string) => void;
};

const ThumbWidth = 64;

/**
 * One movie on the studio board: its first cut's frame, its title, and where
 * it stands. A wide row rather than a grid tile, because the board is a
 * to-do list — what it has to convey is state, not cover art.
 */
export function MovieRow({ movie, onPress }: MovieRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        movie.title,
        MovieStatusLabels[movie.status],
        `스냅 ${movie.snapCount}`,
        movie.progress === undefined ? undefined : `${Math.round(movie.progress * 100)}%`,
      ]
        .filter(Boolean)
        .join(' · ')}
      onPress={() => onPress(movie.id)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.stack}>
        {movie.coverUris.length > 0 ? (
          movie.coverUris.map((uri) => (
            <View key={uri} style={[styles.thumb, { borderColor: theme.border }]}>
              <VideoFrame uri={uri} />
            </View>
          ))
        ) : (
          <View style={[styles.thumb, styles.emptyThumb, { borderColor: theme.border }]} />
        )}
      </View>

      <View style={styles.info}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {movie.title}
        </ThemedText>
        <View style={styles.tags}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            스냅 {movie.snapCount} · {formatSeconds(movie.totalSec)}
          </ThemedText>
          <MovieStatusBadge status={movie.status} />
          <ThemedText type="note" themeColor="textSecondary">
            {movie.dateLabel}
          </ThemedText>
        </View>
        {movie.progress !== undefined ? (
          // A job in flight is the one thing the board exists to show, so the row
          // carries its own bar rather than only a status word.
          <View style={[styles.track, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: theme.ai, width: `${Math.round(movie.progress * 100)}%` },
              ]}
            />
          </View>
        ) : null}
        {movie.status === 'failed' ? (
          <MovieFailureNotice movieId={movie.id} error={movie.error} snapCount={movie.snapCount} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  stack: { flexDirection: 'row', gap: Spacing.half },
  thumb: {
    width: ThumbWidth,
    height: ThumbWidth,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyThumb: { borderStyle: 'dashed' },
  info: { flex: 1, gap: Spacing.half },
  tags: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.half },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: Spacing.half,
  },
  fill: { height: '100%', borderRadius: 2 },
});
