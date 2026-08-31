import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type Props = {
  email: string;
  onResend: () => void;
  isPending: boolean;
  error: string | null;
};

/** Shown after a recovery link is sent; tapping the link deep-links back and the
 *  guard shows the update-password screen. No code entry. */
export function ResetEmailSentNotice({ email, onResend, isPending, error }: Props) {
  return (
    <View style={styles.container}>
      <ThemedText type="heading">메일을 확인해 주세요</ThemedText>
      <ThemedText themeColor="textSecondary">
        {`${email} 주소로 비밀번호 재설정 링크를 보냈어요. 이 기기에서 메일의 링크를 누르면 새 비밀번호를 설정할 수 있어요.`}
      </ThemedText>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isPending}
        onPress={onResend}
        style={styles.resend}
      >
        <ThemedText type="linkPrimary">재설정 메일 다시 보내기</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
  resend: { alignSelf: 'flex-start' },
});
