import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { TrashedSnap } from '@/features/restore-snap';
import { requestSnapReconcile } from '@/features/reconcile-snaps';

import { RecentlyDeletedPage } from './recently-deleted-page';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/entities/session', () => ({
  useIsAuthenticated: () => true,
}));

// The reconcile slice is a sibling feature; only its request is observed here.
jest.mock('@/features/reconcile-snaps', () => ({
  requestSnapReconcile: jest.fn(),
}));

// The HTTP boundary of the restore feature.
const mockList = jest.fn<Promise<TrashedSnap[]>, []>();
const mockRestore = jest.fn<Promise<void>, [string]>();
jest.mock('@/features/restore-snap/api/get-trashed-snaps', () => ({
  getTrashedSnaps: () => mockList(),
}));
jest.mock('@/features/restore-snap/api/restore-server-snap', () => ({
  restoreServerSnap: (videoId: string) => mockRestore(videoId),
}));

const DayMs = 24 * 60 * 60 * 1000;

function trashed(videoId: string): TrashedSnap {
  const now = Date.now();
  return {
    videoId,
    capturedAt: now - 3 * DayMs,
    durationSec: 3,
    deletedAt: now - DayMs,
    restorableUntil: now + 4 * DayMs + 60_000,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <RecentlyDeletedPage />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RecentlyDeletedPage', () => {
  it('says when nothing waits to come back', async () => {
    mockList.mockResolvedValue([]);
    await renderPage();

    expect(
      await screen.findByText(
        '\uCD5C\uADFC \uC0AD\uC81C\uD55C \uC2A4\uB0C5\uC774 \uC5C6\uC5B4\uC694',
      ),
    ).toBeTruthy(); // 최근 삭제한 스냅이 없어요
  });

  it('lists each deleted snap with how long it can still come back', async () => {
    mockList.mockResolvedValue([trashed('v1')]);
    await renderPage();

    expect(await screen.findByText('3\uCD08 \u00B7 5\uC77C \uB0A8\uC74C')).toBeTruthy(); // 3초 · 5일 남음
  });

  it('brings a snap back, asks the library to pick it up, and says so', async () => {
    mockList.mockResolvedValueOnce([trashed('v1')]).mockResolvedValue([]);
    mockRestore.mockResolvedValue();
    await renderPage();

    fireEvent.press(
      await screen.findByRole('button', { name: / \uC2A4\uB0C5 \uB418\uC0B4\uB9AC\uAE30$/ }),
    );

    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('v1'));
    await waitFor(() => expect(requestSnapReconcile).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText('\uC2A4\uB0C5\uC744 \uB418\uC0B4\uB838\uC5B4\uC694'),
    ).toBeTruthy(); // 스냅을 되살렸어요
    expect(
      await screen.findByText(
        '\uCD5C\uADFC \uC0AD\uC81C\uD55C \uC2A4\uB0C5\uC774 \uC5C6\uC5B4\uC694',
      ),
    ).toBeTruthy();
  });

  it('offers another try when the list could not be read', async () => {
    mockList.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    await renderPage();

    expect(
      await screen.findByText(
        '\uCD5C\uADFC \uC0AD\uC81C\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694',
      ),
    ).toBeTruthy(); // 최근 삭제를 불러오지 못했어요
    fireEvent.press(screen.getByRole('button', { name: '\uB2E4\uC2DC \uC2DC\uB3C4' })); // 다시 시도

    expect(
      await screen.findByText(
        '\uCD5C\uADFC \uC0AD\uC81C\uD55C \uC2A4\uB0C5\uC774 \uC5C6\uC5B4\uC694',
      ),
    ).toBeTruthy();
  });
});
