import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { socialProviders } from '../model/social-provider';
import { useSignIn } from '../model/use-sign-in';
import { SocialLoginButton } from './social-login-button';

/**
 * The reusable social sign-in action: renders every offered provider button
 * (`socialProviders`) and drives the sign-in flow. Success is observed by the
 * root route guard, which moves the user into the app; this component only
 * surfaces progress and failure.
 */
export function SocialLoginList() {
  const { signIn, pendingProvider, error } = useSignIn();

  return (
    <View style={styles.container}>
      {socialProviders.map((provider) => (
        <SocialLoginButton
          key={provider.id}
          provider={provider}
          loading={pendingProvider === provider.id}
          disabled={pendingProvider !== null && pendingProvider !== provider.id}
          onPress={() => signIn(provider.id)}
        />
      ))}
      {error ? (
        <ThemedText type="small" themeColor="danger" style={styles.error} accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  error: { textAlign: 'center' },
});
