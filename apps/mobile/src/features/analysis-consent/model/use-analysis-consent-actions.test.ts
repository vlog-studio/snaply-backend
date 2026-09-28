import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { ApiError } from '@/shared/api';

import type { AnalysisConsent } from './analysis-consent';
import { useAnalysisOfferStore } from './analysis-offer-store';
import { useAnalysisConsent } from './use-analysis-consent';
import { useAnalysisConsentActions } from './use-analysis-consent-actions';
import { useAnalysisOffer } from './use-analysis-offer';

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/entities/session', () => ({
  useCurrentUser: () => ({ id: 'account-a', displayName: 'A', provider: 'email' }),
}));

// The HTTP boundary. Everything on the app side of it — the query cache, the
// offer store, the hooks composing them — runs for real.
const mockGet = jest.fn<Promise<AnalysisConsent>, []>();
const mockGive = jest.fn<Promise<AnalysisConsent>, []>();
const mockWithdraw = jest.fn<Promise<AnalysisConsent>, []>();
jest.mock('../api/get-analysis-consent', () => ({
  getAnalysisConsent: () => mockGet(),
}));
jest.mock('../api/give-analysis-consent', () => ({
  giveAnalysisConsent: () => mockGive(),
}));
jest.mock('../api/withdraw-analysis-consent', () => ({
  withdrawAnalysisConsent: () => mockWithdraw(),
}));

const notGranted: AnalysisConsent = { available: true, granted: false, grantedAt: null };
const granted: AnalysisConsent = {
  available: true,
  granted: true,
  grantedAt: new Date('2026-09-29T01:00:00.000Z'),
};

async function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => ({
      consent: useAnalysisConsent(),
      offer: useAnalysisOffer(),
      actions: useAnalysisConsentActions(),
    }),
    { wrapper },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAnalysisOfferStore.setState({ declinedBy: {}, hasHydrated: true });
});

describe('useAnalysisOffer', () => {
  it('offers analysis to an account that can have it and has not answered', async () => {
    mockGet.mockResolvedValue(notGranted);

    const { result } = await render();

    await waitFor(() => expect(result.current.offer.visible).toBe(true));
  });

  it('does not offer while the server has analysis switched off', async () => {
    mockGet.mockResolvedValue({ ...notGranted, available: false });

    const { result } = await render();

    await waitFor(() => expect(result.current.consent.isLoaded).toBe(true));
    expect(result.current.offer.visible).toBe(false);
  });

  it('does not offer again after 괜찮아요', async () => {
    mockGet.mockResolvedValue(notGranted);
    const { result } = await render();
    await waitFor(() => expect(result.current.offer.visible).toBe(true));

    await act(async () => result.current.offer.decline());

    expect(result.current.offer.visible).toBe(false);
  });

  it('does not offer before the device remembers whether it was declined', async () => {
    useAnalysisOfferStore.setState({ declinedBy: {}, hasHydrated: false });
    mockGet.mockResolvedValue(notGranted);

    const { result } = await render();

    await waitFor(() => expect(result.current.consent.isLoaded).toBe(true));
    expect(result.current.offer.visible).toBe(false);
  });
});

describe('useAnalysisConsentActions', () => {
  it('turns analysis on everywhere the consent is read, without a refetch', async () => {
    mockGet.mockResolvedValue(notGranted);
    mockGive.mockResolvedValue(granted);
    const { result } = await render();
    await waitFor(() => expect(result.current.consent.isLoaded).toBe(true));

    let took = false;
    await act(async () => {
      took = await result.current.actions.give();
    });

    expect(took).toBe(true);
    expect(result.current.consent.granted).toBe(true);
    expect(result.current.offer.visible).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('says the yes did not take, and leaves analysis off', async () => {
    mockGet.mockResolvedValue(notGranted);
    mockGive.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline'));
    const { result } = await render();
    await waitFor(() => expect(result.current.consent.isLoaded).toBe(true));

    await act(async () => {
      await result.current.actions.give();
    });

    expect(result.current.actions.error).toBe(
      '\uC2A4\uB0C5 \uBD84\uC11D\uC744 \uCF1C\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.',
    );
    expect(result.current.consent.granted).toBe(false);
    expect(result.current.actions.pending).toBeNull();
  });

  // The server records a yes only to its current wording; an older build is
  // told to update rather than to retry a yes that can never take.
  it('asks for an update when the wording moved on under this build', async () => {
    mockGet.mockResolvedValue(notGranted);
    mockGive.mockRejectedValue(
      new ApiError('CONSENT_VERSION_MISMATCH', 'wording changed', { status: 409 }),
    );
    const { result } = await render();
    await waitFor(() => expect(result.current.consent.isLoaded).toBe(true));

    await act(async () => {
      await result.current.actions.give();
    });

    expect(result.current.actions.error).toBe(
      '\uC571\uC744 \uC5C5\uB370\uC774\uD2B8\uD55C \uB4A4 \uB2E4\uC2DC \uCF1C \uC8FC\uC138\uC694.',
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('withdraws, and the next template screen does not ask again', async () => {
    mockGet.mockResolvedValue(granted);
    mockWithdraw.mockResolvedValue(notGranted);
    const { result } = await render();
    await waitFor(() => expect(result.current.consent.granted).toBe(true));

    await act(async () => {
      await result.current.actions.withdraw();
    });

    expect(result.current.consent.granted).toBe(false);
    expect(result.current.offer.visible).toBe(false);
    expect(useAnalysisOfferStore.getState().declinedBy['account-a']).toBe(true);
  });

  it('says the withdrawal did not take, and leaves analysis on', async () => {
    mockGet.mockResolvedValue(granted);
    mockWithdraw.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline'));
    const { result } = await render();
    await waitFor(() => expect(result.current.consent.granted).toBe(true));

    await act(async () => {
      await result.current.actions.withdraw();
    });

    expect(result.current.actions.error).toBe(
      '\uC2A4\uB0C5 \uBD84\uC11D\uC744 \uB044\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.',
    );
    expect(result.current.consent.granted).toBe(true);
  });

  it('ignores a second tap while the first yes is in flight', async () => {
    mockGet.mockResolvedValue(notGranted);
    let resolveGive: (consent: AnalysisConsent) => void = () => {};
    mockGive.mockImplementation(
      () =>
        new Promise<AnalysisConsent>((resolve) => {
          resolveGive = resolve;
        }),
    );
    const { result } = await render();
    await waitFor(() => expect(result.current.consent.isLoaded).toBe(true));

    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.actions.give();
    });
    await waitFor(() => expect(result.current.actions.pending).toBe('give'));
    let second = true;
    await act(async () => {
      second = await result.current.actions.give();
    });
    await act(async () => {
      resolveGive(granted);
      await first;
    });

    expect(second).toBe(false);
    expect(mockGive).toHaveBeenCalledTimes(1);
  });
});
