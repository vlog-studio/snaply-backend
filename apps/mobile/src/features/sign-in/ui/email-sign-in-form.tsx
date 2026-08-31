import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { FormTextField } from '@/shared/ui/form-text-field';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { emailSignInSchema, type EmailSignInValues } from '../model/email-sign-in-schema';
import { useEmailSignIn } from '../model/use-email-sign-in';

/**
 * Email/password sign-in form. Field validation is `emailSignInSchema`; the
 * async sign-in and its pending/error state belong to `useEmailSignIn`.
 * Cross-screen navigation (sign-up, password reset) is composed by the page.
 */
export function EmailSignInForm() {
  const { signIn, isPending, error } = useEmailSignIn();
  const { control, handleSubmit } = useForm<EmailSignInValues>({
    resolver: zodResolver(emailSignInSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit((values) => signIn(values.email, values.password));

  return (
    <View style={styles.form}>
      <FormTextField
        control={control}
        name="email"
        label="이메일"
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!isPending}
        returnKeyType="next"
      />
      <FormTextField
        control={control}
        name="password"
        label="비밀번호"
        placeholder="비밀번호"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        editable={!isPending}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <SnaplyButton
        title={isPending ? '로그인 중…' : '로그인'}
        disabled={isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.four },
});
