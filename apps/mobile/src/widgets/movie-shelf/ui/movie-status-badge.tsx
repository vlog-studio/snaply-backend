import { StyleSheet, View } from 'react-native';

import type { MovieStatus } from '@/entities/movie';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export const MovieStatusLabels: Record<MovieStatus, string> = {
  draft: '초안',
  generating: '생성 중',
  ready: '완성',
  failed: '실패',
};

export type MovieStatusBadgeProps = {
  status: MovieStatus;
};

/**
 * Where a movie stands, as a pill. Shared by the board row and the grid tile so
 * a status reads as the same word and color wherever a movie is drawn.
 */
export function MovieStatusBadge({ status }: MovieStatusBadgeProps) {
  const theme = useTheme();
  const color =
    status === 'failed'
      ? theme.danger
      : status === 'generating'
        ? theme.ai
        : status === 'ready'
          ? theme.lumen
          : theme.amber;

  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <ThemedText selectable={false} type="note" style={{ color }}>
        {MovieStatusLabels[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
});
