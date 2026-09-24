import { ScrollView, StyleSheet } from 'react-native';

import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';

import { RowDivider, SettingRow, SettingsSection } from './rows';

/**
 * The 소셜 연결 settings screen (`/settings/social`). Both rows are visible
 * placeholders for the planned capability (owner decision, 2026-08-12) and read
 * 준비 중 with no connect control (owner decision, 2026-09-24): the backend
 * integration works only for a single test account, so a 연결 button would
 * promise something no other user can do.
 */
export function MeSocialPage() {
  const theme = useTheme();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection>
        <SettingRow icon="logo-tiktok" title="TikTok" sub="준비 중" />
        <RowDivider />
        <SettingRow icon="logo-instagram" title="Instagram" sub="준비 중" />
      </SettingsSection>
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
});
