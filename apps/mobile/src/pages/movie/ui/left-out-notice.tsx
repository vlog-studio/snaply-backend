import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type LeftOutNoticeProps = {
  count: number;
  onReAdd: () => void;
  onDismiss: () => void;
};

/**
 * How many handed-over snaps the edit draft did not put in, and the way back
 * for them (MOV-21). No reason is given — what the draft judged is not the
 * user's to argue with, and putting a snap back costs one tap, so nothing is
 * lost by not saying why.
 */
export function LeftOutNotice({ count, onReAdd, onDismiss }: LeftOutNoticeProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.warmSurface }]}
    >
      <ThemedText type="small" style={styles.text}>
        스냅 {count}개는 넣지 않았어요
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`넣지 않은 스냅 ${count}개 다시 넣기`}
        hitSlop={12}
        onPress={onReAdd}
      >
        <ThemedText selectable={false} type="smallBold" themeColor="primary">
          다시 넣기
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="알림 닫기"
        hitSlop={12}
        onPress={onDismiss}
      >
        <Ionicons name="close" size={16} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  text: { flex: 1 },
});
