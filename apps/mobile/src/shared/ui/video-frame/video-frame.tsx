import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useVideoThumbnail } from '@/shared/lib/video-thumbnails';

import { useTheme } from '../theme';

export type VideoFrameProps = {
  /** Source video URI; its first frame is sampled and drawn. */
  uri: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A video's first frame, drawn plainly — what a snap or a movie cover looks like
 * in a grid.
 *
 * The frame is extracted through the shared, disk-cached `video-thumbnails` util
 * (a one-shot native call), not a live video player. That is what lets a whole
 * grid render at once: mounting one `useVideoPlayer` per cell exhausts the
 * platform's small pool of hardware decoders, so every cell but the last
 * silently stays black.
 *
 * Business-agnostic — it takes a bare URI, not a `Snap`. It fills its parent
 * (absolute fill); the caller owns the cell's shape, border, `overflow:
 * 'hidden'`, and anything drawn on top.
 */
export function VideoFrame({ uri, style }: VideoFrameProps) {
  const theme = useTheme();
  const thumbnailUri = useVideoThumbnail(uri);
  // Whether the frame was already known when this component mounted (the hook
  // answers synchronously for frames resolved earlier this session). A remount —
  // a grid swapping in and out of selection mode — must repaint instantly; only
  // a frame extracted just now gets the surface fade.
  const [hadFrameAtMount] = useState(() => thumbnailUri !== undefined);

  return (
    <View style={[styles.fill, { backgroundColor: theme.media }, style]}>
      {thumbnailUri ? (
        <Image
          accessible={false}
          source={{ uri: thumbnailUri }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          // Keep the decoded bitmap in memory (the default 'disk' policy
          // re-reads and re-decodes on every remount, so a grid swap blinks
          // every cell).
          cachePolicy="memory-disk"
          transition={hadFrameAtMount ? 0 : 240}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
