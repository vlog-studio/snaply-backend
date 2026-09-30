import { Linking, ScrollView, StyleSheet, Switch } from 'react-native';

import { useAlbumAutoSave } from '@/features/save-snap-to-album';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';

import { RowDivider, SettingRow, SettingsSection } from './rows';

/**
 * The 앨범 저장 settings screen (`/settings/album`) — whether every snap shot
 * here also goes to the device's album (SNAP-18). Saving one snap at a time is
 * the snap player's; this screen owns only the automatic copy.
 *
 * The row says what the copy is worth, because that is the whole reason to turn
 * it on: the server keeps a snap for a while, the album keeps it for good. A
 * device that no longer lets the app add to the album gets the blocked line and
 * the way to the OS settings instead, like the notification switches.
 */
export function MeAlbumPage() {
  const theme = useTheme();
  const autoSave = useAlbumAutoSave();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection>
        <SettingRow
          icon="images-outline"
          title="찍은 스냅을 앨범에도 저장"
          sub={
            autoSave.blocked
              ? '기기 설정에서 사진 추가를 허용해야 저장돼요.'
              : '앱을 지우거나 보관 기간이 끝나도 앨범의 스냅은 남아요.'
          }
          subColor={autoSave.blocked ? 'danger' : 'textSecondary'}
          right={
            <Switch
              accessibilityLabel="찍은 스냅을 앨범에도 저장"
              value={autoSave.enabled}
              onValueChange={autoSave.setEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.border}
            />
          }
        />
        {autoSave.blocked ? (
          <>
            <RowDivider />
            <SettingRow
              icon="settings-outline"
              title="설정에서 권한 켜기"
              onPress={() => void Linking.openSettings()}
            />
          </>
        ) : null}
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
