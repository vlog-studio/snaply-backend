import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  useLocationAlerts,
  useMovieReadyAlerts,
  useQuietHours,
} from '@/features/notification-settings';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { LocationAlertsSheet } from './location-alerts-sheet';
import { RowDivider, SettingRow, SettingsSection } from './rows';

/**
 * The 알림 settings screen (`/settings/notifications`) — every notification
 * preference in one place: the capture-reminder placeholders (준비 중), the
 * movie-completion and location alerts, and the quiet hours that bound them
 * all. The 나 tab keeps only the one-line summary of what is set here.
 *
 * The alerts and the quiet hours are the account's, held by the server (NTF-7):
 * the controls hold still until it has answered, and a change it refuses goes
 * back with a line saying so.
 */
export function MeNotificationsPage() {
  const theme = useTheme();
  const movieReadyAlerts = useMovieReadyAlerts();
  const locationAlerts = useLocationAlerts();
  // The OS prompts run only after the in-app sheet's yes; flipping the switch
  // on just opens the sheet, so a dismissal costs nothing and can be re-asked.
  const [locationSheetVisible, setLocationSheetVisible] = useState(false);
  const quietHours = useQuietHours();
  // Every control writes the same account record, so one refusal line serves
  // them all; the last control touched is the one it is about.
  const saveError = movieReadyAlerts.error ?? locationAlerts.error ?? quietHours.error;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      {/* Reminders are a placeholder for the planned capability (owner
          decision, 2026-09-24): no scheduler consumes the stored windows or
          frequency, so a control would promise a notification that never
          comes. Same treatment as 소셜 연결 — a row that reads 준비 중. */}
      <SettingsSection>
        <SettingRow icon="alarm-outline" title="촬영 리마인더" sub="준비 중" />
        <RowDivider />
        <SettingRow icon="repeat-outline" title="하루 빈도" sub="준비 중" />
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
              disabled={!movieReadyAlerts.ready}
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
              disabled={!locationAlerts.ready}
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
        <HourStepper
          label="시작"
          value={quietHours.start}
          disabled={!quietHours.ready}
          onChange={quietHours.setStart}
        />
        <RowDivider />
        <HourStepper
          label="종료"
          value={quietHours.end}
          disabled={!quietHours.ready}
          onChange={quietHours.setEnd}
        />
        <RowDivider />
        <View style={styles.quietHint}>
          <ThemedText type="small" themeColor="textSecondary">
            {`${formatHour(quietHours.start)}부터 ${formatHour(quietHours.end)}까지는 알림을 보내지 않아요.`}
          </ThemedText>
        </View>
      </SettingsSection>

      {saveError ? (
        <ThemedText type="small" themeColor="danger" style={styles.saveError}>
          {saveError}
        </ThemedText>
      ) : null}

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
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
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
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onChange((value + 23) % 24)}
            style={[
              styles.stepperButton,
              { borderColor: theme.border, opacity: disabled ? 0.4 : 1 },
            ]}
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
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onChange((value + 1) % 24)}
            style={[
              styles.stepperButton,
              { borderColor: theme.border, opacity: disabled ? 0.4 : 1 },
            ]}
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
  saveError: { paddingHorizontal: Spacing.four },
});
