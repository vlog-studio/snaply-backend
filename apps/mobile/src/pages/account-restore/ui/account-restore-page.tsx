import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccountPurgeAfter, useClearSession } from '@/entities/session';
import { useRestoreAccount } from '@/features/delete-account';
import { formatFullDate } from '@/shared/lib/datetime';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * The full-screen block for an account inside its deletion grace period
 * (`/account-restore`). The route guard forces it whenever the backend has
 * answered `ACCOUNT_PENDING_DELETION`, so the only ways out are the two
 * offered here: restore (releases the guard back into the app) or sign out.
 */
export function AccountRestorePage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const clearSession = useClearSession();
  const purgeAfter = useAccountPurgeAfter();
  const { restoreAccount, isPending, error } = useRestoreAccount();

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + Spacing.eight,
          paddingBottom: insets.bottom + Spacing.six,
        },
      ]}
    >
      <View style={styles.copy}>
        <Ionicons color={theme.amber} name="hourglass-outline" size={40} />
        <ThemedText type="subtitle">삭제 대기 중인 계정</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {purgeAfter
            ? `${formatFullDate(purgeAfter.getTime())} 이후 영구 삭제`
            : '기한이 지나면 영구 삭제됩니다'}
        </ThemedText>
      </View>

      <View style={styles.actions}>
        {error ? (
          <ThemedText type="small" themeColor="danger" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}
        <SnaplyButton
          title={isPending ? '복구 중…' : '계정 복구'}
          disabled={isPending}
          onPress={() => void restoreAccount()}
        />
        <SnaplyButton
          title="로그아웃"
          variant="ghost"
          disabled={isPending}
          onPress={() => void clearSession()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
  },
  copy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actions: { gap: Spacing.two },
  error: { textAlign: 'center' },
});
