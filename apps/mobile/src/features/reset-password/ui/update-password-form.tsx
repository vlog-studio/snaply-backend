import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { PASSWORD_MIN_LENGTH } from '@/shared/lib/validation';
import { FormTextField } from '@/shared/ui/form-text-field';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { updatePasswordSchema, type UpdatePasswordValues } from '../model/update-password-schema';
import { useUpdatePassword } from '../model/use-update-password';

/**
 * Step 2 UI of password reset, shown on the update-password screen after a
 * recovery deep link. Field validation is `updatePasswordSchema`; on success the
 * recovery state ends and the route guard reveals the app.
 */
export function UpdatePasswordForm() {
  const { updatePassword, isPending, error } = useUpdatePassword();
  const { control, handleSubmit } = useForm<UpdatePasswordValues>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const submit = handleSubmit((values) => updatePassword(values.password));

  return (
    <View style={styles.form}>
      <ThemedText themeColor="textSecondary">새로 사용할 비밀번호를 입력해 주세요.</ThemedText>
      <FormTextField
        control={control}
        name="password"
        label="새 비밀번호"
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
        label="새 비밀번호 확인"
        placeholder="새 비밀번호 다시 입력"
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
        title={isPending ? '변경 중…' : '비밀번호 변경'}
        disabled={isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.four },
});
