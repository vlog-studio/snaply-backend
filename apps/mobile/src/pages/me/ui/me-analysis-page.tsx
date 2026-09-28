import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  AnalysisConsentSheet,
  useAnalysisConsent,
  useAnalysisConsentActions,
} from '@/features/analysis-consent';
import { formatFullDate } from '@/shared/lib/datetime';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { SettingRow, SettingsSection } from './rows';

/**
 * The 스냅 분석 settings screen (`/settings/analysis`) — the account's consent
 * to snap analysis, and the way to take it back (specs ANA-5).
 *
 * Turning it on opens the consent sheet with the full wording, and only its yes
 * records a consent — the same two-stage shape as the location alerts. Turning
 * it off withdraws at once: the row already says what that costs, and switching
 * back on asks again, so nothing here is irreversible for the user.
 *
 * A granted consent stays withdrawable even while the server has analysis
 * switched off — the right to say no does not depend on the feature being up.
 */
export function MeAnalysisPage() {
  const theme = useTheme();
  const consent = useAnalysisConsent();
  const actions = useAnalysisConsentActions();
  const [sheetVisible, setSheetVisible] = useState(false);

  const readOut =
    consent.granted && consent.grantedAt
      ? `${formatFullDate(consent.grantedAt.getTime())}에 켰어요. 끄면 분석 결과를 지워요.`
      : '켜면 템플릿의 컷을 스냅에 더 어울리게 채워요.';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection>
        <SettingRow
          icon="scan-outline"
          title="스냅 분석"
          sub={consent.isLoaded ? readOut : undefined}
          right={
            <Switch
              accessibilityLabel="스냅 분석"
              value={consent.granted}
              // Off with nothing to turn on is a switch that cannot move; the
              // screen is only reachable that way with a consent to withdraw.
              disabled={actions.pending !== null || (!consent.available && !consent.granted)}
              onValueChange={(value) => {
                if (value) setSheetVisible(true);
                else void actions.withdraw();
              }}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.border}
            />
          }
        />
      </SettingsSection>

      {actions.error && !sheetVisible ? (
        <View
          style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.warmSurface }]}
        >
          <ThemedText type="small">{actions.error}</ThemedText>
        </View>
      ) : null}

      <AnalysisConsentSheet
        visible={sheetVisible}
        pending={actions.pending === 'give'}
        error={actions.error}
        onAccept={async () => {
          if (await actions.give()) setSheetVisible(false);
        }}
        onDecline={() => setSheetVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.eight,
    gap: Spacing.five,
  },
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
});
