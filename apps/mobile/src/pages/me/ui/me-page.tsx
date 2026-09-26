import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { creditQueries } from '@/entities/credit';
import { useMovies } from '@/entities/movie';
import { useClearSession, useCurrentUser } from '@/entities/session';
import { useSnaps } from '@/entities/snap';
import { useMovieReadyEnabled, useNotificationEnabled } from '@/features/notification-settings';
import {
  MaxContentWidth,
  Radius,
  Spacing,
  useTabBarHeight,
  useTheme,
  useThemeMode,
  useTopContentInset,
  type ThemeMode,
} from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { recordedDayCount, weekRecord } from '../model/week-record';
import { RowDivider, SettingRow } from './rows';
import { WeekRing } from './week-ring';

const appVersion = Constants.expoConfig?.version;

const themeModeLabels: Record<ThemeMode, string> = {
  system: '시스템',
  light: '라이트',
  dark: '다크',
};

/**
 * The 나 tab — this week's record as the hero, and the preferences as summary
 * rows that each open their own screen, except a capability that is 준비 중,
 * whose row says so and opens nothing.
 *
 * The screen used to be every setting fully expanded, three viewports deep,
 * all at one visual weight. Now the state stays readable at the root (each
 * row's read-out is the current setting) and the controls live one push away
 * (`/settings/*`) — reveal the controls gradually, never the state.
 */
export function MePage() {
  const theme = useTheme();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const currentUser = useCurrentUser();
  const clearSession = useClearSession();
  const snaps = useSnaps();
  const movies = useMovies();
  const movieReadyAlerts = useMovieReadyEnabled();
  const locationAlerts = useNotificationEnabled();
  const themeMode = useThemeMode();
  const creditBalance = useQuery(creditQueries.balance());

  const days = weekRecord(snaps.map((snap) => snap.capturedAt));
  const recordedDays = recordedDayCount(days);

  // Reminders are 준비 중, so the read-out summarizes only the alerts that
  // actually arrive.
  const enabledAlerts = [movieReadyAlerts && '무비 완성', locationAlerts && '위치'].filter(
    (label): label is string => Boolean(label),
  );
  const alertSummary = enabledAlerts.length ? enabledAlerts.join(' · ') : '모두 꺼짐';

  return (
    <ScrollView
      ref={scrollRef}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Spacing.six + topInset, paddingBottom: Spacing.eight + tabBarHeight },
      ]}
    >
      <View style={styles.hero}>
        <WeekRing days={days} initial={(currentUser?.displayName ?? '?').charAt(0)} size={148} />
        <View style={styles.heroCopy}>
          <ThemedText type="subtitle" numberOfLines={1}>
            {currentUser?.displayName ?? '로그인하지 않음'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`이번 주 ${recordedDays}일 기록`}
          </ThemedText>
        </View>
        <View style={styles.statPills}>
          <StatPill label="스냅" value={snaps.length} />
          <StatPill label="무비" value={movies.length} />
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        <SettingRow
          icon="ticket-outline"
          title="크레딧"
          // The read-out is the current balance; while it loads or fails the
          // row stays a plain doorway rather than showing a number that lies.
          sub={
            creditBalance.data
              ? `${creditBalance.data.balance.toLocaleString('ko-KR')} 크레딧`
              : undefined
          }
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/credits')}
        />
        <RowDivider />
        <SettingRow
          icon="notifications-outline"
          title="알림"
          sub={alertSummary}
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/notifications')}
        />
        <RowDivider />
        <SettingRow
          icon="contrast-outline"
          title="화면 테마"
          sub={themeModeLabels[themeMode]}
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/theme')}
        />
        <RowDivider />
        {/* 준비 중, and a row with nothing behind it: nothing reads interests yet
            — the app never sends them and the server's arrival push does not
            consult them — so a picker would promise personalization that never
            happens. The same placeholder the capture reminders use. */}
        <SettingRow icon="heart-outline" title="관심사" sub="준비 중" subLines={1} />
        <RowDivider />
        {/* The planned connections stay visible (owner decision) but open
            nothing: the screen behind the row only repeated 준비 중 for each
            platform, so the row names the platforms itself. No 연결 button
            anywhere — the backend integration works for a single test account,
            and a connect control would promise what no other user can do. */}
        <SettingRow
          icon="link-outline"
          title="소셜 연결"
          sub="TikTok · Instagram 준비 중"
          subLines={1}
        />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        <Pressable accessibilityRole="button" style={styles.accountAction} onPress={clearSession}>
          <ThemedText type="smallBold">로그아웃</ThemedText>
        </Pressable>
        <RowDivider />
        <Pressable
          accessibilityRole="button"
          style={styles.accountAction}
          onPress={() => router.push('/settings/delete-account')}
        >
          <ThemedText type="smallBold" themeColor="danger">
            계정 삭제
          </ThemedText>
        </Pressable>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
        {appVersion ? `Snaply ${appVersion}` : 'Snaply'}
      </ThemedText>
    </ScrollView>
  );
}

function Chevron() {
  const theme = useTheme();
  return <Ionicons color={theme.textSecondary} name="chevron-forward" size={16} />;
}

function StatPill({ label, value }: { label: string; value: number }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.statPill,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.five,
  },
  hero: { alignItems: 'center', gap: Spacing.four },
  heroCopy: { alignItems: 'center', gap: Spacing.half },
  statPills: { flexDirection: 'row', gap: Spacing.two },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 36,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    borderRadius: Radius.pill,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  accountAction: { minHeight: 54, justifyContent: 'center', paddingHorizontal: Spacing.four },
  version: { textAlign: 'center', paddingTop: Spacing.three },
});
