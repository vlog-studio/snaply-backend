import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useCurrentUser } from '@/entities/session';
import { ApiError } from '@/shared/api';

import { analysisConsentQueries } from '../api/analysis-consent.queries';
import { giveAnalysisConsent } from '../api/give-analysis-consent';
import { withdrawAnalysisConsent } from '../api/withdraw-analysis-consent';

import type { AnalysisConsent } from './analysis-consent';
import { useDeclineAnalysisOffer } from './analysis-offer-store';

const GiveErrorMessage = '스냅 분석을 켜지 못했어요. 다시 시도해 주세요.';
/** The server records consent to newer wording than this build shows. */
const StaleWordingMessage = '앱을 업데이트한 뒤 다시 켜 주세요.';
const WithdrawErrorMessage = '스냅 분석을 끄지 못했어요. 다시 시도해 주세요.';

export type AnalysisConsentActions = {
  /** Says yes to the wording this build shows. Resolves whether it took. */
  give: () => Promise<boolean>;
  /** Withdraws; the server destroys what it analysed. Resolves whether it took. */
  withdraw: () => Promise<boolean>;
  pending: 'give' | 'withdraw' | null;
  error: string | null;
};

/**
 * Turning analysis on and off.
 *
 * Each call writes the server's answer straight into the consent query, so
 * every screen reading it — the template screen's recommendation, the 나 tab's
 * switch — moves at once without a refetch. Withdrawing also marks the offer
 * declined: someone who just turned analysis off does not want the next
 * template screen asking again.
 */
export function useAnalysisConsentActions(): AnalysisConsentActions {
  const queryClient = useQueryClient();
  const accountId = useCurrentUser()?.id;
  const declineOffer = useDeclineAnalysisOffer();
  const [pending, setPending] = useState<'give' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = (consent: AnalysisConsent) =>
    queryClient.setQueryData(analysisConsentQueries.status().queryKey, consent);

  async function give(): Promise<boolean> {
    if (pending) return false;
    setPending('give');
    setError(null);
    try {
      commit(await giveAnalysisConsent());
      return true;
    } catch (cause) {
      const stale = cause instanceof ApiError && cause.code === 'CONSENT_VERSION_MISMATCH';
      setError(stale ? StaleWordingMessage : GiveErrorMessage);
      // Re-read, so the screens stop offering wording the server no longer takes.
      if (stale) void queryClient.invalidateQueries({ queryKey: analysisConsentQueries.all() });
      return false;
    } finally {
      setPending(null);
    }
  }

  async function withdraw(): Promise<boolean> {
    if (pending) return false;
    setPending('withdraw');
    setError(null);
    try {
      commit(await withdrawAnalysisConsent());
      if (accountId) declineOffer(accountId);
      return true;
    } catch {
      setError(WithdrawErrorMessage);
      return false;
    } finally {
      setPending(null);
    }
  }

  return { give, withdraw, pending, error };
}
