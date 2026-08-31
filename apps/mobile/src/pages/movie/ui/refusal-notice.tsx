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
 * `rejected` has no entry: that refusal carries the backend's own message, which
 * is the only thing that tells one cause from another — an ownership problem, a
 * video that is not ready, and whatever the backend refuses next all arrive as
 * one status with one code.
 */
export const GenerationRefusalMessages: Record<Exclude<GenerationRefusal, 'rejected'>, string> = {
  empty: '컷이 하나도 없어서 만들 수 없어요. 스냅을 먼저 넣어주세요.',
  frozen: '이미 만드는 중이에요.',
  uploading: '스냅을 서버에 올리는 중이에요. 잠시 뒤에 다시 시도해주세요.',
  'no-credit': '크레딧이 부족해요. 나 탭의 크레딧에서 채울 수 있어요.',
  unreachable: '서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
};

/** The line for a refusal, using the server's wording when it sent one. */
export function generationRefusalMessage(
  refused: GenerationRefusal,
  message?: string,
  shortfall?: CreditShortfall,
): string {
  if (refused === 'rejected') return message ?? '지금은 만들 수 없어요.';
  // The 402's own numbers, when it carried them: what this run costs and what
  // the account holds is the whole decision the user is about to make.
  if (refused === 'no-credit' && shortfall) {
    return `크레딧이 부족해요 · ${shortfall.balance}/${shortfall.required}. 나 탭의 크레딧에서 채울 수 있어요.`;
  }
  return GenerationRefusalMessages[refused];
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
