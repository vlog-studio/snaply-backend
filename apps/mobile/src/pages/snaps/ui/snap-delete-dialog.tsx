import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { MovieDeleteImpact } from '../model/use-movie-delete-impact';

export type SnapDeleteDialogProps = {
  visible: boolean;
  count: number;
  /** Movies that would lose cuts — empty when nothing references the snaps. */
  impact: MovieDeleteImpact[];
  isDeleting: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Confirms deleting originals, naming what else it takes with them.
 *
 * Deleting a snap is the one irreversible action in the app: the video file goes
 * with it, and every movie holding that cut loses it. The sheet therefore lists
 * the movies by name and the count each drops to, rather than warning in the
 * abstract.
 */
export function SnapDeleteDialog({
  visible,
  count,
  impact,
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm,
}: SnapDeleteDialogProps) {
  const theme = useTheme();

  return (
    <BottomSheet accessibilityLabel="스냅 삭제 확인" visible={visible} onClose={onCancel}>
      <ThemedText type="note" themeColor="danger">
        원본 삭제
      </ThemedText>
      <ThemedText type="heading">스냅 {count}개를 지울까요?</ThemedText>
      <ThemedText themeColor="textSecondary">
        영상 파일까지 지워져요. 되돌릴 수 없습니다.
      </ThemedText>

      {impact.length > 0 ? (
        <View style={[styles.impact, { borderColor: theme.border }]}>
          <ThemedText type="note" themeColor="textSecondary">
            영향받는 무비 {impact.length}
          </ThemedText>
          {impact.map((movie) => (
            <View key={movie.movieId} style={styles.impactRow}>
              <ThemedText type="small" numberOfLines={1} style={styles.impactTitle}>
                {movie.title}
              </ThemedText>
              <ThemedText type="note" themeColor="textSecondary">
                컷 {movie.cutCount} → {movie.nextCutCount}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      {errorMessage ? (
        <ThemedText type="small" themeColor="danger">
          {errorMessage}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제 취소"
          disabled={isDeleting}
          onPress={onCancel}
          style={[styles.action, { borderColor: theme.border }]}
        >
          <ThemedText selectable={false} type="button">
            취소
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`스냅 ${count}개 삭제`}
          accessibilityState={{ disabled: isDeleting }}
          disabled={isDeleting}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.danger,
              borderColor: theme.danger,
              opacity: isDeleting ? 0.5 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {isDeleting ? '지우는 중…' : '삭제'}
          </ThemedText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  impact: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  impactRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  impactTitle: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  action: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
