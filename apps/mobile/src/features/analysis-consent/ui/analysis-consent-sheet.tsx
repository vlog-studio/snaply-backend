import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type AnalysisConsentSheetProps = {
  visible: boolean;
  /** A yes is being recorded — both answers wait for it. */
  pending?: boolean;
  /** What went wrong with the last yes, in the user's words. */
  error?: string | null;
  /** The user said yes; the caller records it (`useAnalysisConsentActions().give`). */
  onAccept: () => void;
  /** Declining and dismissing are the same answer: nothing is sent. */
  onDecline: () => void;
};

/**
 * The consent itself — every fact the user is agreeing to, stated in full.
 *
 * This is the one surface where the app's "no explanatory copy" rule gives way:
 * a consent is legal text and must be complete (UX principles, "Legally
 * required disclosures and consent"). What is sent, to whom and where, what it
 * is used for, how long the provider keeps it, how to take it back, and that
 * saying no costs nothing — the same facts the privacy policy states
 * (`apps/api/src/routes/legal.ts`). Changing a sentence here means changing
 * `AnalysisConsentVersion`, because the server records which wording a yes was
 * given to.
 */
export function AnalysisConsentSheet({
  visible,
  pending = false,
  error,
  onAccept,
  onDecline,
}: AnalysisConsentSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet accessibilityLabel="스냅 분석 켜기" visible={visible} onClose={onDecline}>
      <ThemedText type="heading">스냅 분석을 켤까요?</ThemedText>
      <View style={styles.facts}>
        <ThemedText type="small" themeColor="textSecondary">
          컷에 넣을 스냅마다 정지 이미지를 4장까지 OpenAI(미국)로 보내 분석해요. 소리는 보내지
          않아요.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          분석 결과는 어떤 스냅을 어느 컷에 넣을지 고르는 데만 써요. OpenAI는 이미지를 학습에 쓰지
          않고, 남용 방지를 위해 최대 30일 보관한 뒤 지워요.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          나 탭에서 언제든 끌 수 있고, 끄면 분석 결과를 지워요. 켜지 않아도 템플릿은 그대로 쓸 수
          있어요.
        </ThemedText>
      </View>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스냅 분석 안 켜기"
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={onDecline}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border, opacity: pressed || pending ? 0.6 : 1 },
          ]}
        >
          <ThemedText selectable={false} type="button">
            안 켜기
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스냅 분석 켜기"
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.primary,
              borderColor: theme.primary,
              opacity: pressed || pending ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {pending ? '켜는 중…' : '분석 켜기'}
          </ThemedText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  facts: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  action: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
