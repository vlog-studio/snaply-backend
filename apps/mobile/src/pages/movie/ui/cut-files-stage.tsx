import { Pressable, StyleSheet, View } from 'react-native';

import type { SnapFiles } from '@/entities/snap';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type CutFilesStageProps = {
  files: SnapFiles;
};

/**
 * The stage while the cuts' videos are still being brought onto this device. A
 * snap shot on another device plays from a copy fetched on first play
 * (SNAP-15), and the cut player can only play what is here — handed a file
 * that has not arrived it would stand still without a word. This holds the
 * player's frame meanwhile, so the stage does not jump when the cuts arrive.
 */
export function CutFilesStage({ files }: CutFilesStageProps) {
  const theme = useTheme();

  return (
    <View style={[styles.box, { backgroundColor: theme.media }]}>
      <ThemedText selectable={false} style={styles.text}>
        {files.failed ? '스냅을 불러오지 못했어요' : '불러오는 중…'}
      </ThemedText>
      {files.failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스냅 다시 불러오기"
          hitSlop={Spacing.two}
          onPress={files.retry}
          style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText selectable={false} type="smallBold" style={styles.text}>
            다시 시도
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The player's own box: height-bound, 9:16, so nothing around it moves.
  box: {
    flex: 1,
    aspectRatio: 9 / 16,
    maxWidth: '100%',
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  // Over the media backdrop, like the watch stage's own state text.
  text: { color: '#FFFFFF', textAlign: 'center' },
  retry: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
