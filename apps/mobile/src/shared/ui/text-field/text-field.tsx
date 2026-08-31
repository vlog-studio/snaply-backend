import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Fonts, Radius, Spacing, Typography, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type TextFieldProps = TextInputProps & {
  /** Field label rendered above the input. */
  label?: string;
  /** Error message rendered below the input; also recolors the border. */
  error?: string;
};

/**
 * Themed single-line text input. The design system had no input primitive, so
 * this is the shared base every form (auth email/password/OTP, and future
 * forms) builds on. It owns presentation only — focus/error border color and
 * the label/error slots — and forwards all native `TextInput` props (secure
 * entry, keyboard type, autocomplete, etc.) so callers control behavior.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, style, onBlur, onFocus, editable = true, accessibilityLabel, ...props },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? theme.danger : focused ? theme.primary : theme.border;

  return (
    <View style={styles.container}>
      {label ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        ref={ref}
        editable={editable}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.primary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor,
            color: theme.text,
            opacity: editable ? 1 : 0.5,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.four,
    // Body family, size, and weight, matching `ThemedText`'s default so a field
    // reads as the same text as the screen around it — a `TextInput` is outside
    // `ThemedText`, so it names the family itself. Only the size is taken from
    // the scale: `lineHeight` on a `TextInput` shifts the text off the input's
    // own vertical centering on Android, and `minHeight` already sets the height.
    fontFamily: Fonts.sans,
    fontSize: Typography.body.fontSize,
    fontWeight: '500',
  },
});
