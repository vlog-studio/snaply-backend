import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type LocationAlertsSheetProps = {
  visible: boolean;
  /** The user said yes — the caller now runs the OS permission requests. */
  onAccept: () => void;
  /** Declining and dismissing both leave the switch off; nothing is asked. */
  onDecline: () => void;
};

/**
 * The in-app question that precedes the OS location prompts. The OS "always
 * allow" prompt is one-shot — once declined it never shows again — so the ask
 * runs in two stages: this sheet states what the alerts do and what they need,
 * and only a yes here surfaces the OS prompts. A no closes the sheet with the
 * switch off and costs nothing; the question can be re-asked any time the user
 * flips the switch again.
 */
export function LocationAlertsSheet({ visible, onAccept, onDecline }: LocationAlertsSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet accessibilityLabel="위치 알림 켜기" visible={visible} onClose={onDecline}>
      <ThemedText type="heading">주변 스팟 알림을 받을까요?</ThemedText>
      <ThemedText themeColor="textSecondary">
        촬영 스팟에 도착하면 알려드려요. 앱을 열지 않아도 알리려면 위치 &apos;항상 허용&apos;이
        필요해요.
      </ThemedText>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림 안 받기"
          onPress={onDecline}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <ThemedText selectable={false} type="button">
            안 받기
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림 받기"
          onPress={onAccept}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.primary,
              borderColor: theme.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            알림 받기
          </ThemedText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
