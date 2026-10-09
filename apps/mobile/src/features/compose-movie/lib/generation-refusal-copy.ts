import type { GenerationRefusal } from '../model/use-compose-movie';
import type { CreditShortfall } from './read-credit-shortfall';

/**
 * Why a run could not be started, in the user's words: what refused it, then —
 * where there is a step to take — what to do about it.
 *
 * The table lives in this feature rather than on a screen because two layers
 * answer the same refusals: the movie screen's footer (`pages/movie`) and the
 * failed-movie card on the board and the grid (`widgets/movie-shelf`), which
 * may not import each other. The card has room for the first sentence only
 * ({@link generationRefusalHeadline}); the screen says both
 * ({@link generationRefusalMessage}). Splitting one table, not keeping two, is
 * what keeps the card's line the screen's line cut short.
 *
 * `rejected` is worded here too, never with the backend's own message: that
 * refusal lumps an ownership problem, a video that is not ready, and whatever
 * the backend refuses next into one status with one code, and its text is a
 * server diagnostic, not user copy (2026-09-24).
 *
 * `no-credit` says only the shortfall: there is no purchase, so the one way to
 * top up — watching a rewarded ad — is named only when that door is open
 * (`generationRefusalMessage`'s `adsEnabled`).
 *
 * `busy` names both ways out — the other run ending, or the user canceling it.
 */
const RefusalLines: Record<GenerationRefusal, { headline: string; next?: string }> = {
  empty: { headline: '컷이 하나도 없어서 만들 수 없어요.', next: '스냅을 먼저 넣어 주세요.' },
  frozen: { headline: '이미 만드는 중이에요.' },
  uploading: { headline: '스냅을 올리는 중이에요.', next: '다 올라가면 만들 수 있어요.' },
  'no-credit': { headline: '크레딧이 부족해요.' },
  busy: {
    headline: '다른 무비를 만드는 중이에요.',
    next: '다 만들어지거나 취소하면 만들 수 있어요.',
  },
  unreachable: {
    headline: '연결하지 못했어요.',
    next: '인터넷 연결을 확인하고 다시 시도해 주세요.',
  },
  rejected: { headline: '지금은 무비를 만들 수 없어요.', next: '잠시 후 다시 시도해 주세요.' },
};

/** Appended to a credit refusal only while the rewarded-ad entry is open. */
const AdTopUpHint = ' 나 탭 크레딧에서 광고를 보고 받을 수 있어요.';

/**
 * What refused the run, in one sentence — the line a movie card has room for.
 *
 * A credit refusal carries the 402's own numbers when it had them: what the
 * run costs and what the account holds is the whole decision the user is about
 * to make.
 */
export function generationRefusalHeadline(
  refused: GenerationRefusal,
  shortfall?: CreditShortfall,
): string {
  if (refused === 'no-credit' && shortfall) {
    return `크레딧이 부족해요 · ${shortfall.balance}/${shortfall.required}.`;
  }
  return RefusalLines[refused].headline;
}

/**
 * The full line for a refusal, as the movie screen states it.
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
  const headline = generationRefusalHeadline(refused, shortfall);
  if (refused === 'no-credit') return adsEnabled ? `${headline}${AdTopUpHint}` : headline;
  const { next } = RefusalLines[refused];
  return next ? `${headline} ${next}` : headline;
}
