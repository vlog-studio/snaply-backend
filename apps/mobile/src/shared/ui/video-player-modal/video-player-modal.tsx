import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoPreview } from '@/shared/ui/video-preview';

export type VideoPlayerModalProps = {
  /**
   * The video to play. `undefined` closes the modal, which is also what
   * unmounts the player — a mounted `expo-video` player holds one of the
   * platform's few hardware decoders, so it must not linger behind a hidden
   * modal.
   */
  uri: string | undefined;
  onClose: () => void;
  /** Announced on the close control; the caller names what is being closed. */
  closeLabel: string;
  /**
   * Micro-label printed along the bottom edge of the frame. Named for where it
   * sits, not for a type role: it renders as `note`, since callers pass Korean
   * durations that the mono `edge` role cannot draw.
   */
  edgeLabel?: string;
  /** Dimmer second line under the edge print. */
  caption?: string;
};

/**
 * Full-screen video playback over black: a looping native player with a close
 * control and a two-line edge-print overlay along the bottom.
 *
 * Business-agnostic — it takes a bare URI and two strings rather than a `Snap`,
 * like `VideoFrame` does. That split is what lets the screens that play a video
 * keep their own wording (the same snap reads as "3번째 컷" in a movie's cut list and
 * as its length in the library) while sharing one implementation of the chrome
 * around it.
 *
 * The overlay text is drawn against arbitrary video rather than an app surface,
 * so the muted line is a white wash instead of `textSecondary` — the palette's
 * warm brown disappears over a bright frame.
 */
export function VideoPlayerModal({
  uri,
  onClose,
  closeLabel,
  edgeLabel,
  caption,
}: VideoPlayerModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={uri !== undefined}
    >
      <View style={styles.screen}>
        {uri ? (
          // Keyed on the URI so switching videos remounts the player instead of
          // re-pointing a running one, which carries the old playhead over.
          <VideoPreview key={uri} contentFit="contain" muted={false} nativeControls uri={uri} />
        ) : null}
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.close, { top: insets.top + Spacing.three }]}
        >
          <ThemedText selectable={false} style={styles.closeText}>
            ×
          </ThemedText>
        </Pressable>
        {uri && (edgeLabel !== undefined || caption !== undefined) ? (
          <View style={[styles.meta, { bottom: insets.bottom + Spacing.four }]}>
            {edgeLabel !== undefined ? <ThemedText type="note">{edgeLabel}</ThemedText> : null}
            {caption !== undefined ? (
              <ThemedText type="small" style={styles.caption}>
                {caption}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Pure black, not the app ground: this is a letterbox around a frame.
  screen: { flex: 1, backgroundColor: '#000000' },
  close: {
    position: 'absolute',
    left: Spacing.four,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.56)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 30, lineHeight: 32 },
  meta: {
    position: 'absolute',
    left: Spacing.five,
    right: Spacing.five,
    alignItems: 'center',
    gap: Spacing.one,
    pointerEvents: 'none',
  },
  caption: { color: 'rgba(255,255,255,0.62)' },
});
