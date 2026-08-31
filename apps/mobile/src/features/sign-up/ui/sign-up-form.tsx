import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { PASSWORD_MIN_LENGTH } from '@/shared/lib/validation';
import { FormTextField } from '@/shared/ui/form-text-field';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { signUpSchema, type SignUpValues } from '../model/sign-up-schema';

type Props = {
  onSubmit: (email: string, password: string) => void;
  isPending: boolean;
  error: string | null;
};

/**
 * Presentational account-creation form. Field validation is `signUpSchema`; the
 * async sign-up and its pending/error state are owned by the flow hook and
 * arrive as props.
 */
export function SignUpForm({ onSubmit, isPending, error }: Props) {
  const { control, handleSubmit } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  });

  const submit = handleSubmit((values) => onSubmit(values.email, values.password));

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
      />
      <FormTextField
        control={control}
        name="password"
        label="비밀번호"
        placeholder={`${PASSWORD_MIN_LENGTH}자 이상`}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!isPending}
      />
      <FormTextField
        control={control}
        name="confirm"
        label="비밀번호 확인"
        placeholder="비밀번호 다시 입력"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!isPending}
        onSubmitEditing={() => void submit()}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <SnaplyButton
        title={isPending ? '가입 중…' : '가입하기'}
        disabled={isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.four },
});
