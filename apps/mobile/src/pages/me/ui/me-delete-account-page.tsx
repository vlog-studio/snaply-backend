import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { useDeleteAccount } from '@/features/delete-account';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { RowDivider, SettingRow, SettingsSection } from './rows';

/**
 * The 계정 삭제 confirmation screen (`/settings/delete-account`). The rows are
 * the consequence read-out — what the backend does the moment the account is
 * deleted, and the one path back — so the screen itself is the confirmation
 * step and the button needs no second alert. On success the action clears the
 * session and the route guard lands on sign-in.
 */
export function MeDeleteAccountPage() {
  const theme = useTheme();
  const { deleteAccount, isPending, error } = useDeleteAccount();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection>
        <SettingRow
          icon="film-outline"
          title="만드는 중인 무비는 취소되고, 쓴 크레딧은 돌려드려요"
        />
        <RowDivider />
        <SettingRow icon="notifications-off-outline" title="알림이 모두 꺼져요" />
        <RowDivider />
        <SettingRow icon="time-outline" title="30일 안에 다시 로그인하면 되돌릴 수 있어요" />
      </SettingsSection>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="계정 삭제"
        disabled={isPending}
        onPress={() => void deleteAccount()}
        style={({ pressed }) => [
          styles.deleteButton,
          {
            borderColor: theme.danger,
            backgroundColor: theme.backgroundElement,
            opacity: isPending ? 0.45 : pressed ? 0.78 : 1,
          },
        ]}
      >
        <ThemedText selectable={false} type="button" themeColor="danger">
          {isPending ? '삭제하는 중…' : '계정 삭제'}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.eight,
    gap: Spacing.five,
  },
  deleteButton: {
    marginTop: 'auto',
    minHeight: 56,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
