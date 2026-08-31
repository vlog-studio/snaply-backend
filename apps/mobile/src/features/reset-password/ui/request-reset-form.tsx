import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { FormTextField } from '@/shared/ui/form-text-field';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { requestResetSchema, type RequestResetValues } from '../model/request-reset-schema';

type Props = {
  onSubmit: (email: string) => void;
  isPending: boolean;
  error: string | null;
};

/** Step 1: enter the account email to receive a recovery link. */
export function RequestResetForm({ onSubmit, isPending, error }: Props) {
  const { control, handleSubmit } = useForm<RequestResetValues>({
    resolver: zodResolver(requestResetSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit((values) => onSubmit(values.email));

  return (
    <View style={styles.form}>
      <ThemedText type="small" themeColor="textSecondary">
        가입한 이메일 주소로 인증 코드를 보내드려요.
      </ThemedText>
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
        onSubmitEditing={() => void submit()}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <SnaplyButton
        title={isPending ? '전송 중…' : '인증 코드 받기'}
        disabled={isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.four },
});
