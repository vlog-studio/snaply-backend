import { act, renderHook } from '@testing-library/react-native';

import {
  useAnalysisOfferStore,
  useDeclineAnalysisOffer,
  useIsAnalysisOfferDeclined,
} from './analysis-offer-store';

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

afterEach(() => {
  useAnalysisOfferStore.setState({ declinedBy: {}, hasHydrated: true });
});

describe('analysis offer store', () => {
  it('knows nothing until the file is read back, so no screen flashes the offer', async () => {
    useAnalysisOfferStore.setState({ declinedBy: {}, hasHydrated: false });

    const { result } = await renderHook(() => useIsAnalysisOfferDeclined('account-a'));

    expect(result.current).toBeUndefined();
  });

  it('remembers a decline for the account that declined, and only that one', async () => {
    useAnalysisOfferStore.setState({ declinedBy: {}, hasHydrated: true });
    const { result: decline } = await renderHook(() => useDeclineAnalysisOffer());
    const { result: accountA } = await renderHook(() => useIsAnalysisOfferDeclined('account-a'));
    const { result: accountB } = await renderHook(() => useIsAnalysisOfferDeclined('account-b'));

    expect(accountA.current).toBe(false);
    await act(async () => decline.current('account-a'));

    expect(accountA.current).toBe(true);
    expect(accountB.current).toBe(false);
  });

  it('reads nobody signed in as not declined', async () => {
    useAnalysisOfferStore.setState({ declinedBy: {}, hasHydrated: true });

    const { result } = await renderHook(() => useIsAnalysisOfferDeclined(undefined));

    expect(result.current).toBe(false);
  });
});
