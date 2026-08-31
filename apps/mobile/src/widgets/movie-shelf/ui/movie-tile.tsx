import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { ImageFrame } from '@/shared/ui/image-frame';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

import type { MovieSummary } from '../model/use-movie-shelf';
import { MovieFailureNotice } from './movie-failure-notice';
import { MovieStatusBadge, MovieStatusLabels } from './movie-status-badge';

export type MovieTileProps = {
  movie: MovieSummary;
  /** Tile width in points; the square cover takes the same value for height. */
  width: number;
  onPress: (movieId: string) => void;
  /** A long press starts acting on the movie; absent, a long press does nothing. */
  onLongPress?: (movie: MovieSummary) => void;
  /** Whether the grid is in selection mode — a tap selects instead of opens. */
  selecting?: boolean;
  /** Whether this movie is selected. Read only while `selecting`. */
  selected?: boolean;
};

/**
 * One movie in the movie tab's grid: a square cover with the length and status
 * over it, and the title beneath.
 *
 * The cover is the render's own thumbnail once a run has produced one — the
 * grid is cover art, and a finished movie's cover should be the movie rather
 * than the first thing that went into it. Everything else (a draft, a failed
 * run, a render made before covers were kept, a cover the OS has reclaimed)
 * draws the first cut's frame, which is why the fallback is a state rather than
 * a condition: a local file can vanish under the app, and only the load
 * failing says so.
 *
 * In selection mode a check circle joins the cover — opposite corner from the
 * status badge, so the two never collide — and the border thickens on the
 * selected tiles, the same vocabulary as the snap grid's cells.
 */
export function MovieTile({
  movie,
  width,
  onPress,
  onLongPress,
  selecting = false,
  selected = false,
}: MovieTileProps) {
  const theme = useTheme();
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const coverImage = coverImageFailed ? undefined : movie.coverImageUri;
  const cover = movie.coverUris[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selecting ? { selected } : undefined}
      accessibilityLabel={`${movie.title} · ${MovieStatusLabels[movie.status]} · ${formatSeconds(movie.totalSec)}`}
      accessibilityHint={
        selecting
          ? '탭하면 선택하거나 해제해요'
          : onLongPress
            ? '탭하면 열고, 길게 누르면 선택돼요'
            : undefined
      }
      onPress={() => onPress(movie.id)}
      onLongPress={onLongPress ? () => onLongPress(movie) : undefined}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }, styles.tile]}
    >
      <View
        style={[
          styles.cover,
          { height: width, borderColor: selected ? theme.primary : theme.border },
          selected && styles.selectedCover,
        ]}
      >
        {coverImage ? (
          <ImageFrame uri={coverImage} onError={() => setCoverImageFailed(true)} />
        ) : cover ? (
          <VideoFrame uri={cover} />
        ) : null}
        <View style={styles.badge}>
          <MovieStatusBadge status={movie.status} />
        </View>
        <View style={styles.duration}>
          <ThemedText selectable={false} type="note" style={styles.durationText}>
            {formatSeconds(movie.totalSec)}
          </ThemedText>
        </View>
        {movie.progress !== undefined ? (
          <View style={[styles.track, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: theme.ai, width: `${Math.round(movie.progress * 100)}%` },
              ]}
            />
          </View>
        ) : null}
        {selecting ? (
          <View
            style={[
              styles.check,
              {
                backgroundColor: selected ? theme.primary : 'rgba(0,0,0,0.45)',
                borderColor: selected ? theme.primary : 'rgba(255,255,255,0.7)',
              },
            ]}
          >
            {selected ? (
              <ThemedText selectable={false} type="smallBold" style={{ color: theme.onPrimary }}>
                ✓
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </View>
      <ThemedText type="smallBold" numberOfLines={1}>
        {movie.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {movie.dateLabel} · 스냅 {movie.snapCount}
      </ThemedText>
      {movie.status === 'failed' ? (
        <MovieFailureNotice
          movieId={movie.id}
          error={movie.error}
          snapCount={movie.snapCount}
          variant="tile"
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: Spacing.one },
  // Square, like the snap grid's cells: a cover only has to be recognizable, and
  // a tall 9:16 tile pushed the second row off the screen. Sized in points by
  // the caller rather than shaped with `aspectRatio`, which collapses a wrapped
  // flex cell whose only children are absolutely positioned.
  cover: {
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  selectedCover: { borderWidth: 2 },
  badge: { position: 'absolute', top: Spacing.two, left: Spacing.two },
  check: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    bottom: Spacing.two,
    right: Spacing.two,
    borderRadius: Radius.small,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  // Drawn over arbitrary video, so plain white rather than a palette color.
  durationText: { color: '#FFFFFF' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  fill: { height: '100%' },
});
