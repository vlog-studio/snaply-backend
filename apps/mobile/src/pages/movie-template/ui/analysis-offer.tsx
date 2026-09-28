import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type AnalysisOfferProps = {
  /** Opens the consent sheet — the full wording is agreed to there, not here. */
  onAccept: () => void;
  /** 괜찮아요: remembered, so the next visit does not ask again. */
  onDecline: () => void;
};

/**
 * The question that turns on the second stage, asked where it pays off.
 *
 * It sits under the slots rather than above them: by the time the user reads
 * it the local match has already filled the screen, so what they are asked to
 * trade for is visible (UX `Value Before Cost`). It is one line and two
 * answers, not a sheet on entry — entering the screen is coming to work on a
 * template, and a sheet there would be a request before any result.
 */
export function AnalysisOffer({ onAccept, onDecline }: AnalysisOfferProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.offer,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
      ]}
    >
      <ThemedText type="smallBold">스냅을 분석해서 컷에 더 어울리게 채울까요?</ThemedText>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="괜찮아요, 분석하지 않기"
          hitSlop={8}
          onPress={onDecline}
          style={styles.action}
        >
          <ThemedText selectable={false} type="small" themeColor="textSecondary">
            괜찮아요
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스냅을 분석해서 채우기"
          hitSlop={8}
          onPress={onAccept}
          style={styles.action}
        >
          <ThemedText selectable={false} type="smallBold" style={{ color: theme.primary }}>
            분석해서 채우기
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offer: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.five },
  action: { paddingVertical: Spacing.one },
});
