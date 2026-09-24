import { StyleSheet, View } from 'react-native';

import type { CreditShortfall, CutsRefusal, GenerationRefusal } from '@/features/compose-movie';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/** Why a cut edit was refused, in the user's words. */
export const CutsRefusalMessages: Record<CutsRefusal, string> = {
  empty: '컷이 최소 1개는 있어야 해요.',
  full: '한 편에 들어가는 스냅 수를 넘었어요.',
  frozen: '만드는 동안에는 컷을 고칠 수 없어요.',
};

/**
 * Why a run could not be started, in the user's words.
 *
 * `rejected` is worded here too, never with the backend's own message: that
 * refusal lumps an ownership problem, a video that is not ready, and whatever
 * the backend refuses next into one status with one code, and its text is a
 * server diagnostic, not user copy (2026-09-24).
 *
 * `no-credit` says only the shortfall: there is no purchase, so the one way to
 * top up — watching a rewarded ad — is named only when that door is open
 * (`generationRefusalMessage`'s `adsEnabled`).
 */
export const GenerationRefusalMessages: Record<GenerationRefusal, string> = {
  empty: '컷이 하나도 없어서 만들 수 없어요. 스냅을 먼저 넣어 주세요.',
  frozen: '이미 만드는 중이에요.',
  uploading: '스냅을 올리는 중이에요. 다 올라가면 만들 수 있어요.',
  'no-credit': '크레딧이 부족해요.',
  unreachable: '연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  rejected: '지금은 무비를 만들 수 없어요. 잠시 후 다시 시도해 주세요.',
};

/** Appended to a credit refusal only while the rewarded-ad entry is open. */
const AdTopUpHint = ' 나 탭 크레딧에서 광고를 보고 받을 수 있어요.';

/**
 * The line for a refusal.
 *
 * `adsEnabled` mirrors what the credits screen reads to show its ad row
 * (`adRewardQueries.availability().enabled`); without it a credit refusal
 * names no way out rather than one that is not there.
 */
export function generationRefusalMessage(
  refused: GenerationRefusal,
  shortfall?: CreditShortfall,
  adsEnabled = false,
): string {
  if (refused !== 'no-credit') return GenerationRefusalMessages[refused];
  // The 402's own numbers, when it carried them: what this run costs and what
  // the account holds is the whole decision the user is about to make.
  const base = shortfall
    ? `크레딧이 부족해요 · ${shortfall.balance}/${shortfall.required}.`
    : GenerationRefusalMessages['no-credit'];
  return adsEnabled ? `${base}${AdTopUpHint}` : base;
}

/**
 * The line that answers a refusal — one component, one message table, for both
 * places a refusal surfaces.
 *
 * A refused edit is normally answered in the footer, under the button that
 * refused it; while a job owns the movie the footer is gone, and the refusal
 * still has to be answered. Wording the same rule in two files is how two
 * surfaces come to disagree about it, which the rules the refusals stand for
 * (`features/compose-movie`) exist to prevent.
 */
export function RefusalNotice({ message }: { message: string }) {
  const theme = useTheme();

  return (
    <View
      style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.warmSurface }]}
    >
      <ThemedText type="small">{message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
});
