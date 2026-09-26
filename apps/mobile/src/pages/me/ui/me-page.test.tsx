import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { MePage } from './me-page';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useScrollToTop: jest.fn(),
}));

// The page reads safe-area insets for its padding — a native answer a test has
// no provider for.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The theme-mode store persists through SecureStore.
jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockBalanceKey = ['credit', 'balance'];
jest.mock('@/entities/credit', () => ({
  creditQueries: {
    balance: () => ({ queryKey: mockBalanceKey, queryFn: jest.fn() }),
  },
}));
jest.mock('@/entities/session', () => ({
  useCurrentUser: () => ({ displayName: 'tester@example.com' }),
  useClearSession: () => jest.fn(),
}));
jest.mock('@/entities/snap', () => ({ useSnaps: () => [] }));
jest.mock('@/entities/movie', () => ({ useMovies: () => [] }));
jest.mock('@/features/notification-settings', () => ({
  useMovieReadyEnabled: () => true,
  useNotificationEnabled: () => false,
}));

const interestsTitle = '\uAD00\uC2EC\uC0AC'; // 관심사
const comingSoon = '\uC900\uBE44 \uC911'; // 준비 중
const socialTitle = '\uC18C\uC15C \uC5F0\uACB0'; // 소셜 연결
const socialReadOut = 'TikTok \u00B7 Instagram \uC900\uBE44 \uC911'; // TikTok · Instagram 준비 중
const notificationsTitle = '\uC54C\uB9BC'; // 알림

async function renderPage() {
  // Seeded and never stale or collected, so the balance row renders without a
  // request and no cache timer outlives the test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  queryClient.setQueryData(mockBalanceKey, { balance: 400, entries: [] });
  return render(
    <QueryClientProvider client={queryClient}>
      <MePage />
    </QueryClientProvider>,
  );
}

describe('MePage', () => {
  beforeEach(() => jest.clearAllMocks());

  // Nothing reads interests yet, so a picker would promise personalization
  // that never happens (spec ACC-5, backlog A-9): the row states 준비 중 and is
  // not a way into anything.
  it('shows 관심사 as a 준비 중 placeholder that opens nothing', async () => {
    await renderPage();

    expect(screen.getByText(interestsTitle)).toBeTruthy();
    expect(screen.getByText(comingSoon)).toBeTruthy();
    expect(screen.queryByRole('button', { name: interestsTitle })).toBeNull();
  });

  // The planned connections stay visible, but no screen sits behind them: the
  // row names the platforms itself, and nothing offers to connect.
  it('shows 소셜 연결 as a placeholder naming both platforms, opening nothing', async () => {
    await renderPage();

    expect(screen.getByText(socialTitle)).toBeTruthy();
    expect(screen.getByText(socialReadOut)).toBeTruthy();
    expect(screen.queryByRole('button', { name: socialTitle })).toBeNull();
  });

  it('keeps the rows that have a screen behind them as buttons', async () => {
    await renderPage();

    expect(screen.getByRole('button', { name: notificationsTitle })).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
