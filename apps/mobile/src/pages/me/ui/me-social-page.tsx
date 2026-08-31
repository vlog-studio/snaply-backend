import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { RowDivider, SettingRow, SettingsSection, type RowIconName } from './rows';

/**
 * The 소셜 연결 settings screen (`/settings/social`). Both rows are visible
 * placeholders for the planned capability (owner decision, 2026-08-12) — they
 * must never claim a connection that does not exist.
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
        <SocialRow icon="logo-tiktok" label="TikTok" status="연결 안 됨" />
        <RowDivider />
        <SocialRow icon="logo-instagram" label="Instagram" status="연결 안 됨" />
      </SettingsSection>
    </ScrollView>
  );
}

function SocialRow({
  connected,
  icon,
  label,
  status,
}: {
  connected?: boolean;
  icon: RowIconName;
  label: string;
  status: string;
}) {
  const theme = useTheme();

  return (
    <SettingRow
      icon={icon}
      title={label}
      sub={status}
      subColor={connected ? 'ai' : 'textSecondary'}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={connected ? `${label} 연결 해제` : `${label} 연결`}
          style={[
            styles.connectButton,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}
        >
          <ThemedText selectable={false} type="smallBold">
            {connected ? '해제' : '연결'}
          </ThemedText>
        </Pressable>
      }
    />
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
  connectButton: {
    minWidth: 58,
    minHeight: 36,
    borderRadius: Radius.small,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
