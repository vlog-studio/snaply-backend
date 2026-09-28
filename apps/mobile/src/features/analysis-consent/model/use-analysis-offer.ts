import { useCurrentUser } from '@/entities/session';

import { useDeclineAnalysisOffer, useIsAnalysisOfferDeclined } from './analysis-offer-store';
import { useAnalysisConsent } from './use-analysis-consent';

export type AnalysisOffer = {
  /**
   * Ask on the template screen: the server can analyse, this account has not
   * said yes, and has not declined the offer before on this device.
   */
  visible: boolean;
  /** 괜찮아요 — remembered, so the next visit does not ask again. */
  decline: () => void;
};

/**
 * Whether a screen that uses analysis should put the question to the user.
 *
 * Nothing is offered until both the server's answer and the device's memory of
 * an earlier 괜찮아요 are known — a question that appears and then vanishes is
 * worse than one that arrives a moment later.
 */
export function useAnalysisOffer(): AnalysisOffer {
  const consent = useAnalysisConsent();
  const accountId = useCurrentUser()?.id;
  const declined = useIsAnalysisOfferDeclined(accountId);
  const declineOffer = useDeclineAnalysisOffer();

  return {
    visible:
      accountId !== undefined &&
      consent.isLoaded &&
      consent.available &&
      !consent.granted &&
      declined === false,
    decline: () => {
      if (accountId) declineOffer(accountId);
    },
  };
}
