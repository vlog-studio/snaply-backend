import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { secureStorage } from '@/shared/lib/secure-storage';

type AnalysisOfferState = {
  /** Accounts that answered the offer with 괜찮아요, or turned analysis off themselves. */
  declinedBy: Readonly<Record<string, true>>;
  /** Until the file is read back, nobody is known to have declined — or not. */
  hasHydrated: boolean;
  decline: (accountId: string) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

/**
 * Whether the template screen still offers analysis, per account.
 *
 * The offer is asked once (specs ANA-5: on first use). A 괜찮아요 is kept so a
 * later visit does not ask again, and so is turning analysis off in the 나 tab —
 * someone who just withdrew does not want the next template screen asking. The
 * 나 tab switch stays the way back in either way.
 *
 * A device store keyed by account id rather than an account-scoped file: it
 * holds one yes/no per id and nothing the account made, and every screen that
 * reads it already knows who is signed in — the same reasoning as the
 * deleted-accounts ledger in `features/delete-account`.
 */
export const useAnalysisOfferStore = create<AnalysisOfferState>()(
  persist(
    (set) => ({
      declinedBy: {},
      hasHydrated: false,
      decline: (accountId) =>
        set((state) =>
          state.declinedBy[accountId]
            ? state
            : { declinedBy: { ...state.declinedBy, [accountId]: true } },
        ),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'snaply.analysis-offer',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ declinedBy: state.declinedBy }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

/**
 * Whether the account has declined the offer. `undefined` until the file is
 * read back, so a screen never flashes the offer at someone who said no.
 */
export function useIsAnalysisOfferDeclined(accountId: string | undefined): boolean | undefined {
  return useAnalysisOfferStore((state) => {
    if (!state.hasHydrated) return undefined;
    return accountId ? state.declinedBy[accountId] === true : false;
  });
}

export function useDeclineAnalysisOffer(): (accountId: string) => void {
  return useAnalysisOfferStore((state) => state.decline);
}
