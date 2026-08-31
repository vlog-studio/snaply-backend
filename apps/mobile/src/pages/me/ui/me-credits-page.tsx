import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { creditQueries } from '@/entities/credit';
import {
  adRewardQueries,
  useWatchRewardAd,
  type AdRewardRefusal,
  type WatchRewardAdOutcome,
  type WatchRewardAdPhase,
} from '@/features/watch-reward-ad';
import { formatTimestamp } from '@/shared/lib/datetime';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { RowDivider, SettingRow, SettingsSection } from './rows';

/**
 * Ledger reasons in the user's words. A reason the backend adds later falls
 * back rather than blanking the row — the delta and the date still say what
 * happened to the balance.
 */
const reasonLabels: Record<string, string> = {
  purchase: '크레딧 구매',
  signup_bonus: '가입 보너스',
  export_reserve: '무비 만들기',
  export_refund: '만들기 취소 환급',
  store_refund_revoke: '구매 환불 회수',
  promo: '프로모션',
  ad_reward: '광고 보상',
};

/**
 * What the row narrates while the flow is somewhere.
 *
 * `preparing` and `showing` deliberately say the same thing. A rewarded ad is
 * fullscreen, so this row is behind it the entire time one plays — "재생 중"
 * can only ever be read in the moment before an ad arrives, or in the flash
 * where none arrives at all, which is exactly when it is untrue. Issuing the
 * session and waiting for an ad are one wait from where the user is standing.
 */
const phaseLabels: Record<Exclude<WatchRewardAdPhase, 'idle'>, string> = {
  preparing: '준비 중…',
  showing: '준비 중…',
  settling: '지급 확인 중…',
};

/**
 * Why no credits arrived, in the user's words. `pending` is deliberately not
 * worded as a failure — the grant may still land, and the balance above this
 * line is already refetching.
 */
const adRefusalMessages: Record<AdRewardRefusal, string> = {
  disabled: '지금은 광고 보상을 제공하지 않아요.',
  cooldown: '잠시 뒤에 다시 볼 수 있어요.',
  limit: '오늘 볼 수 있는 광고를 다 봤어요.',
  dismissed: '광고를 끝까지 봐야 지급돼요.',
  unavailable: '지금은 보여줄 광고가 없어요. 잠시 뒤에 다시 시도해주세요.',
  pending: '지급 확인 중이에요. 잔액에 곧 반영돼요.',
  unreachable: '서버에 연결하지 못했어요. 다시 시도해주세요.',
};

function outcomeMessage(outcome: WatchRewardAdOutcome): string | undefined {
  if (outcome.granted) {
    return outcome.credits !== undefined ? `+${outcome.credits} 지급됐어요.` : '지급됐어요.';
  }
  // A dismissed ad was the user's own call; answering it with a message would
  // read as a reproach, and the row's state already says nothing changed.
  if (outcome.refused === 'dismissed') return undefined;
  return outcome.refused ? adRefusalMessages[outcome.refused] : undefined;
}

/**
 * The 크레딧 screen (`/settings/credits`) — the balance as the hero, one row
 * that turns an ad into credits, and the ledger under them. 100 credits is
 * one movie export; the movie screen is where that spend happens, so this
 * screen only shows the consequences.
 *
 * Everything the ad row claims — the amount, the daily count, whether it
 * shows at all — is the server's answer (`adRewardQueries.availability()`),
 * never a number of the app's own.
 */
export function MeCreditsPage() {
  const theme = useTheme();
  const balanceQuery = useQuery(creditQueries.balance());
  const availabilityQuery = useQuery(adRewardQueries.availability());
  const { watchAd, phase } = useWatchRewardAd();
  const [lastOutcome, setLastOutcome] = useState<WatchRewardAdOutcome>();

  const availability = availabilityQuery.data;
  const running = phase !== 'idle';

  const runAd = async () => {
    if (running) return;
    setLastOutcome(undefined);
    setLastOutcome(await watchAd());
  };

  const adRowSub = running
    ? phaseLabels[phase]
    : availability && availability.remainingToday <= 0
      ? '내일 다시 볼 수 있어요'
      : availability
        ? `오늘 ${availability.remainingToday}회 남음`
        : undefined;

  const outcomeLine = lastOutcome ? outcomeMessage(lastOutcome) : undefined;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        {balanceQuery.data ? (
          <ThemedText type="title">{balanceQuery.data.balance.toLocaleString('ko-KR')}</ThemedText>
        ) : (
          <ThemedText type="title" themeColor="textSecondary">
            {balanceQuery.isError ? '—' : ' '}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          보유 크레딧 · 무비 1편 = 100
        </ThemedText>
        {balanceQuery.isError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="잔액 다시 불러오기"
            onPress={() => void balanceQuery.refetch()}
          >
            <ThemedText type="smallBold" themeColor="primary">
              다시 불러오기
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {availability?.enabled ? (
        <SettingsSection>
          <SettingRow
            icon="play-circle-outline"
            title={`광고 보고 +${availability.rewardCredits}`}
            sub={adRowSub}
            right={
              running ? undefined : (
                <ThemedText type="smallBold" themeColor="primary">
                  보기
                </ThemedText>
              )
            }
            onPress={running || availability.remainingToday <= 0 ? undefined : () => void runAd()}
            accessibilityLabel={`광고 보고 크레딧 ${availability.rewardCredits} 받기`}
          />
          {outcomeLine ? (
            <>
              <RowDivider />
              <View style={styles.outcomeLine}>
                <ThemedText
                  type="small"
                  themeColor={lastOutcome?.granted ? 'primary' : 'textSecondary'}
                >
                  {outcomeLine}
                </ThemedText>
              </View>
            </>
          ) : null}
        </SettingsSection>
      ) : null}

      {balanceQuery.data && balanceQuery.data.entries.length > 0 ? (
        <SettingsSection title="내역">
          {balanceQuery.data.entries.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 ? <RowDivider /> : null}
              <SettingRow
                title={reasonLabels[entry.reason] ?? '기타'}
                sub={formatTimestamp(entry.createdAt.getTime())}
                right={
                  <ThemedText
                    type="smallBold"
                    themeColor={entry.delta >= 0 ? 'primary' : 'textSecondary'}
                  >
                    {entry.delta >= 0 ? `+${entry.delta}` : `${entry.delta}`}
                  </ThemedText>
                }
              />
            </View>
          ))}
        </SettingsSection>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.eight,
    gap: Spacing.five,
  },
  hero: { alignItems: 'center', gap: Spacing.one },
  outcomeLine: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
});
