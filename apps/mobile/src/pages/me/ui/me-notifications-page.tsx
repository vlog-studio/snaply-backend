import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  useLocationAlerts,
  useMovieReadyAlerts,
  useQuietEnd,
  useQuietStart,
  useReminderFrequency,
  useReminderWindows,
  useSetQuietEnd,
  useSetQuietStart,
  useSetReminderFrequency,
  useSetReminderWindow,
  type ReminderWindowId,
} from '@/features/notification-settings';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { reminderWindowOptions } from '../model/reminder-windows';
import { LocationAlertsSheet } from './location-alerts-sheet';
import { OptionPill, RowDivider, SettingRow, SettingsSection, type RowIconName } from './rows';

const reminderWindowIcons: Record<ReminderWindowId, RowIconName> = {
  morning: 'partly-sunny-outline',
  lunch: 'sunny-outline',
  evening: 'moon-outline',
};

/**
 * The 알림 settings screen (`/settings/notifications`) — every notification
 * preference in one place: the capture-reminder windows and daily frequency,
 * the movie-completion and location alerts, and the quiet hours that bound
 * them all. The 나 tab keeps only the one-line summary of what is set here.
 */
export function MeNotificationsPage() {
  const theme = useTheme();
  const reminderWindows = useReminderWindows();
  const setReminderWindow = useSetReminderWindow();
  const reminderFrequency = useReminderFrequency();
  const setReminderFrequency = useSetReminderFrequency();
  const movieReadyAlerts = useMovieReadyAlerts();
  const locationAlerts = useLocationAlerts();
  // The OS prompts run only after the in-app sheet's yes; flipping the switch
  // on just opens the sheet, so a dismissal costs nothing and can be re-asked.
  const [locationSheetVisible, setLocationSheetVisible] = useState(false);
  const quietStart = useQuietStart();
  const quietEnd = useQuietEnd();
  const setQuietStart = useSetQuietStart();
  const setQuietEnd = useSetQuietEnd();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection title="촬영 리마인더">
        {reminderWindowOptions.map((window, index) => (
          <View key={window.id}>
            {index > 0 ? <RowDivider /> : null}
            <SettingRow
              icon={reminderWindowIcons[window.id]}
              title={window.label}
              sub={window.time}
              right={
                <Switch
                  accessibilityLabel={`${window.label} 촬영 리마인더`}
                  value={reminderWindows[window.id]}
                  onValueChange={(value) => setReminderWindow(window.id, value)}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.border}
                />
              }
            />
          </View>
        ))}
        <RowDivider />
        <SettingRow
          title="하루 빈도"
          right={
            <View style={styles.frequencyOptions}>
              {[1, 2, 3].map((value) => (
                <OptionPill
                  key={value}
                  label={`${value}회`}
                  accessibilityLabel={`하루 ${value}회`}
                  selected={reminderFrequency === value}
                  onPress={() => setReminderFrequency(value)}
                />
              ))}
            </View>
          }
        />
      </SettingsSection>

      <SettingsSection title="무비 알림">
        <SettingRow
          icon="sparkles-outline"
          title="무비 완성 알림"
          // The title already says what arrives; the row narrates only the
          // blocked state, which the user must act on in OS settings.
          sub={
            movieReadyAlerts.blocked
              ? '기기 설정에서 Snaply 알림을 켜야 받을 수 있어요.'
              : undefined
          }
          subColor="danger"
          right={
            <Switch
              accessibilityLabel="무비 완성 알림 받기"
              value={movieReadyAlerts.enabled}
              onValueChange={movieReadyAlerts.setEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.border}
            />
          }
        />
        {movieReadyAlerts.blocked ? (
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

      <SettingsSection title="위치 알림">
        <SettingRow
          icon="location-outline"
          title="위치 알림 받기"
          sub={
            locationAlerts.blocked
              ? '기기 설정에서 위치를 항상 허용해야 받을 수 있어요.'
              : undefined
          }
          subColor="danger"
          right={
            <Switch
              accessibilityLabel="위치 알림 받기"
              value={locationAlerts.enabled}
              onValueChange={(value) => {
                if (value) setLocationSheetVisible(true);
                else locationAlerts.setEnabled(false);
              }}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.border}
            />
          }
        />
        {locationAlerts.blocked ? (
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

      <SettingsSection title="조용한 시간">
        <HourStepper label="시작" value={quietStart} onChange={setQuietStart} />
        <RowDivider />
        <HourStepper label="종료" value={quietEnd} onChange={setQuietEnd} />
        <RowDivider />
        <View style={styles.quietHint}>
          <ThemedText type="small" themeColor="textSecondary">
            {`${formatHour(quietStart)}부터 ${formatHour(quietEnd)}까지는 알림을 보내지 않아요.`}
          </ThemedText>
        </View>
      </SettingsSection>

      <LocationAlertsSheet
        visible={locationSheetVisible}
        onAccept={() => {
          setLocationSheetVisible(false);
          locationAlerts.setEnabled(true);
        }}
        onDecline={() => setLocationSheetVisible(false)}
      />
    </ScrollView>
  );
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function HourStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (hour: number) => void;
}) {
  const theme = useTheme();

  return (
    <SettingRow
      title={label}
      right={
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} 시간 줄이기`}
            onPress={() => onChange((value + 23) % 24)}
            style={[styles.stepperButton, { borderColor: theme.border }]}
          >
            <ThemedText selectable={false} type="smallBold">
              −
            </ThemedText>
          </Pressable>
          <ThemedText selectable={false} type="smallBold" style={styles.stepperValue}>
            {formatHour(value)}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} 시간 늘리기`}
            onPress={() => onChange((value + 1) % 24)}
            style={[styles.stepperButton, { borderColor: theme.border }]}
          >
            <ThemedText selectable={false} type="smallBold">
              +
            </ThemedText>
          </Pressable>
        </View>
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
  frequencyOptions: { flexDirection: 'row', gap: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepperButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { minWidth: 56, textAlign: 'center' },
  quietHint: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
});
