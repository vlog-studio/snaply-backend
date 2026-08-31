import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type SnaplyButtonVariant = 'primary' | 'secondary' | 'ai' | 'ghost';

export type SnaplyButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  icon?: string;
  variant?: SnaplyButtonVariant;
};

export function SnaplyButton({
  disabled,
  icon,
  style,
  title,
  variant = 'primary',
  ...props
}: SnaplyButtonProps) {
  const theme = useTheme();
  const backgroundColor = {
    primary: theme.primary,
    secondary: theme.backgroundElement,
    ai: theme.ai,
    ghost: 'transparent',
  }[variant];
  const color = variant === 'primary' || variant === 'ai' ? theme.onPrimary : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={(state) => [
        styles.button,
        {
          backgroundColor,
          borderColor: variant === 'secondary' ? theme.border : 'transparent',
          opacity: disabled ? 0.45 : state.pressed ? 0.78 : 1,
        },
        // Ember glow, so the primary action reads as the warm lamp of the
        // otherwise near-black UI.
        variant === 'primary' && !disabled && styles.glow,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {icon ? (
        <ThemedText selectable={false} style={[styles.icon, { color }]}>
          {icon}
        </ThemedText>
      ) : null}
      <ThemedText selectable={false} type="button" style={{ color }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  icon: { fontSize: 17, lineHeight: 22 },
  glow: { boxShadow: '0 0 24px rgba(234,94,56,0.30)' },
});
