import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { exchangeAuthCode } from '@/entities/session';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type Props = {
  /** 'signin' completes a sign-up confirmation / OAuth; 'recovery' a password reset. */
  mode: 'signin' | 'recovery';
};

/**
 * Landing screen for auth email deep links (`snaplyapp://auth/callback` and
 * `.../auth/reset`). Expo Router routes the link here; this exchanges the PKCE
 * `code` for a session, then hands off: sign-in flows drop into the app, and
 * recovery flows go to the update-password screen. It renders only a spinner.
 */
export function AuthCallbackPage({ mode }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    void (async () => {
      if (typeof code !== 'string') {
        router.replace('/sign-in');
        return;
      }
      const ok = await exchangeAuthCode(code, { recovery: mode === 'recovery' });
      if (!ok) {
        router.replace('/sign-in');
        return;
      }
      // Recovery: the guard now shows update-password (isRecovering). Sign-in:
      // the session is live, so land in the app.
      router.replace(mode === 'recovery' ? '/update-password' : '/');
    })();
  }, [code, mode, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} />
      <ThemedText themeColor="textSecondary">인증을 완료하는 중…</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
});
