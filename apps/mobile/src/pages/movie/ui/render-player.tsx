import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type RenderPlayerProps = {
  /** The rendered file — `movie.render.uri`. A remote URL on real backends. */
  uri: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Plays the file a run produced — watch mode's stage whenever a render has one.
 *
 * One player, one file: the backend already composited the cuts, the music,
 * and the subtitles into this URL, so none of `CutPlayer`'s double buffering,
 * trim boundaries, or playlist bookkeeping applies. What it keeps is the
 * stage's manners: opens paused on the first frame (watching is asked for,
 * never assumed on entry), the tap layer toggles playback, and the ended
 * movie offers a replay.
 *
 * The file usually streams over the network, which local cuts never did, so
 * this stage has two states the cut stage has not: a visible "불러오는 중"
 * while the source loads, and an error face when it cannot be played — a
 * remote URL can rot (the row outlives the object) or the network can be
 * gone, and a silent black stage would read as a broken app rather than an
 * unreachable file.
 */
export function RenderPlayer({ uri, style }: RenderPlayerProps) {
  const theme = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  // The player reports 'loading' while it opens the stream; 'error' is final
  // for this source (retrying is re-entering the screen).
  const [status, setStatus] = useState<'loading' | 'readyToPlay' | 'error'>('loading');

  // The render's own sound is the movie's sound — nothing here mixes or mutes.
  const player = useVideoPlayer(uri, (instance) => {
    instance.muted = false;
  });

  useEventListener(player, 'statusChange', (payload) => {
    if (payload.status === 'loading' || payload.status === 'readyToPlay') setStatus(payload.status);
    if (payload.status === 'error') {
      setStatus('error');
      setIsPlaying(false);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    player.pause();
    setIsPlaying(false);
    setIsEnded(true);
  });

  const togglePlayback = () => {
    if (status === 'error') return;
    if (isEnded) {
      // The player's own replay, not a `currentTime` write — assigning a
      // property on a hook-returned value is the write the React Compiler
      // lint rejects (the same reason CutPlayer seeks with `seekBy`).
      player.replay();
      setIsEnded(false);
      setIsPlaying(true);
      return;
    }
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const overlayIcon = isEnded ? 'refresh' : isPlaying ? 'pause' : 'play';
  const overlayLabel = isEnded ? '무비 다시 재생' : isPlaying ? '일시정지' : '재생';

  return (
    <View style={[styles.stage, { backgroundColor: theme.media }, style]}>
      <VideoView
        allowsPictureInPicture={false}
        contentFit="cover"
        nativeControls={false}
        player={player}
        style={StyleSheet.absoluteFill}
      />

      {status === 'error' ? (
        <View style={styles.stateLayer}>
          <ThemedText selectable={false} style={styles.stateText}>
            완성 파일을 재생할 수 없어요.{'\n'}연결을 확인하고 다시 열어주세요.
          </ThemedText>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={overlayLabel}
          onPress={togglePlayback}
          style={styles.tapLayer}
        >
          {status === 'loading' ? (
            <ThemedText selectable={false} style={styles.stateText}>
              불러오는 중…
            </ThemedText>
          ) : !isPlaying || isEnded ? (
            <View style={styles.playButton}>
              <Ionicons name={overlayIcon} size={24} color="#F1E6DA" />
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  tapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
  },
  // Drawn over arbitrary video, so plain white rather than a palette color —
  // the same reason CutPlayer's counter is.
  stateText: { color: '#FFFFFF', textAlign: 'center' },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(20,15,11,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
