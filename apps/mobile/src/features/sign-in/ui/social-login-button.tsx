import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { SocialProviderMeta } from '../model/social-provider';
import { ProviderIcon } from './provider-icon';

type SocialLoginButtonProps = {
  provider: SocialProviderMeta;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function SocialLoginButton({
  provider,
  loading = false,
  disabled = false,
  onPress,
}: SocialLoginButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={provider.label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={(state) => [
        styles.button,
        {
          backgroundColor: provider.backgroundColor,
          borderColor: provider.borderColor,
          opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={provider.textColor} />
      ) : (
        <>
          <View style={styles.icon}>
            <ProviderIcon provider={provider.id} />
          </View>
          <ThemedText selectable={false} type="button" style={{ color: provider.textColor }}>
            {provider.label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  icon: {
    position: 'absolute',
    left: Spacing.four,
    width: 24,
    alignItems: 'center',
  },
});
