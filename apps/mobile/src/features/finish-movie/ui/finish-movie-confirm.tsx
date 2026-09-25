import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { useFinishMovie } from '../model/use-finish-movie';

export type FinishMovieConfirmProps = {
  movieId: string;
  title: string;
  onCancel: () => void;
  /** The finish landed; the host closes whatever it showed this in. */
  onFinished: () => void;
};

/**
 * The explicit act 끝내기 needs (MOV-18): a confirm step whose words make the
 * loss plain — the completed file is deleted on the server and cannot be
 * watched here again; the composition stays and can be made again for credits.
 *
 * A sheet's content rather than a sheet, like `RenameMovieForm`: it is hosted
 * as a step inside the movie screen's ⋯ sheet and inside the watch stage's
 * own prompt, and two platform Modals swapping visibility race each other's
 * animations. The primary action is deliberately not the danger color: the
 * user is not destroying their work, they are declaring it delivered.
 */
export function FinishMovieConfirm({
  movieId,
  title,
  onCancel,
  onFinished,
}: FinishMovieConfirmProps) {
  const theme = useTheme();
  const { busy, errorMessage, finish } = useFinishMovie();

  const confirm = () => {
    void finish(movieId).then((outcome) => {
      if (outcome.finished) onFinished();
    });
  };

  return (
    <View style={styles.step}>
      <ThemedText type="note" themeColor="textSecondary">
        무비 정리
      </ThemedText>
      <ThemedText type="heading">무비를 기기에 저장했나요?</ThemedText>

      <View style={[styles.summary, { borderColor: theme.border }]}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
      </View>

      <ThemedText themeColor="textSecondary">
        정리하면 이 앱에서 무비를 다시 볼 수 없어요. 컷 구성은 남아서 고쳐 다시 만들 수 있어요. 다시
        만들면 크레딧이 들어요.
      </ThemedText>

      {errorMessage ? (
        <ThemedText type="small" themeColor="danger">
          {errorMessage}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="정리 취소"
          disabled={busy}
          onPress={onCancel}
          style={[styles.action, { borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}
        >
          <ThemedText selectable={false} type="button">
            아직이요
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} 정리하기`}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={confirm}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.primary,
              borderColor: theme.primary,
              opacity: busy ? 0.6 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {busy ? '정리하는 중…' : '저장했어요, 정리하기'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: Spacing.three },
  summary: {
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
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
