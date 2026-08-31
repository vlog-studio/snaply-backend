import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

export type ImageFrameProps = {
  /** The image to draw. A local file or a remote URL. */
  uri: string;
  /** Called when the image cannot be loaded, so the caller can fall back. */
  onError?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * An image filling its parent, drawn the way a grid needs it — the counterpart
 * to `VideoFrame` for material that is already a picture (a render's cover),
 * rather than a video to sample a frame from.
 *
 * `cachePolicy="memory-disk"` for the same reason `VideoFrame` uses it: the
 * default re-reads and re-decodes on every remount, so a grid swapping in and
 * out of selection mode blinks every cell.
 *
 * Business-agnostic — it takes a bare URI. It fills its parent (absolute fill);
 * the caller owns the cell's shape, border, `overflow: 'hidden'`, and anything
 * drawn on top. A caller that has something to fall back to should pass
 * `onError`: a local copy can be reclaimed by the OS and a remote link can rot,
 * and the media backdrop alone would read as a broken cell.
 */
export function ImageFrame({ uri, onError, style }: ImageFrameProps) {
  const theme = useTheme();

  return (
    <View style={[styles.fill, { backgroundColor: theme.media }, style]}>
      <Image
        accessible={false}
        source={{ uri }}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        cachePolicy="memory-disk"
        onError={onError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
