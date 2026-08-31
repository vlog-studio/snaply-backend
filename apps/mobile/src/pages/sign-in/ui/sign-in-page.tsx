import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmailSignInForm, SocialLoginList } from '@/features/sign-in';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export function SignInPage() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={[styles.mark, { backgroundColor: theme.primary }]}>
              <Image
                contentFit="contain"
                source={require('@/assets/images/brand-glyph-white.png')}
                style={styles.glyph}
              />
            </View>
            <ThemedText type="eyebrow" themeColor="primary">
              SNAPLY
            </ThemedText>
            <ThemedText type="title" style={styles.centerText}>
              {'찍기만 하세요.\n나머지는 스냅리가.'}
            </ThemedText>
          </View>

          <View style={styles.actions}>
            <EmailSignInForm />

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textSecondary">
                또는
              </ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <SocialLoginList />

            <Link href="/reset-password" style={styles.centerLink}>
              <ThemedText type="link" themeColor="textSecondary">
                비밀번호를 잊으셨나요?
              </ThemedText>
            </Link>

            <View style={styles.signUpRow}>
              <ThemedText type="small" themeColor="textSecondary">
                계정이 없으신가요?
              </ThemedText>
              <Link href="/sign-up">
                <ThemedText type="linkPrimary">가입하기</ThemedText>
              </Link>
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
              계속하면 서비스 이용약관과 개인정보 처리방침에 동의하게 됩니다.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  hero: { alignItems: 'center', gap: Spacing.two },
  centerText: { textAlign: 'center' },
  actions: { gap: Spacing.four },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  centerLink: { alignSelf: 'center' },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  disclaimer: { textAlign: 'center' },
  mark: {
    width: 64,
    height: 64,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { width: 36, height: 36 },
});
