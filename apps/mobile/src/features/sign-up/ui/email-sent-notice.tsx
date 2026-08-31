import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type Props = {
  email: string;
  onResend: () => void;
  isPending: boolean;
  error: string | null;
};

/**
 * Shown after account creation: the user must tap the confirmation link in
 * their email, which deep-links back into the app and signs them in. No code
 * entry — confirmation is handled globally by the deep-link handler.
 */
export function EmailSentNotice({ email, onResend, isPending, error }: Props) {
  return (
    <View style={styles.container}>
      <ThemedText type="heading">메일을 확인해 주세요</ThemedText>
      <ThemedText themeColor="textSecondary">
        {`${email} 주소로 인증 링크를 보냈어요. 이 기기에서 메일의 링크를 누르면 인증이 완료되고 자동으로 로그인됩니다.`}
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
        <ThemedText type="linkPrimary">인증 메일 다시 보내기</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
  resend: { alignSelf: 'flex-start' },
});
