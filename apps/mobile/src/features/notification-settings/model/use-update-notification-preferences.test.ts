import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import type { NotificationPreferences } from './notification-preferences';
import { useNotificationPreferences } from './use-notification-preferences';
import { useUpdateNotificationPreferences } from './use-update-notification-preferences';

let mockSignedIn = true;
jest.mock('@/entities/session', () => ({
  useIsAuthenticated: () => mockSignedIn,
}));

// The HTTP boundary. The query cache and the hooks composing it run for real.
const mockGet = jest.fn<Promise<NotificationPreferences>, []>();
const mockUpdate = jest.fn<Promise<NotificationPreferences>, [Partial<NotificationPreferences>]>();
jest.mock('../api/get-notification-preferences', () => ({
  getNotificationPreferences: () => mockGet(),
}));
jest.mock('../api/update-notification-preferences', () => ({
  updateNotificationPreferences: (change: Partial<NotificationPreferences>) => mockUpdate(change),
}));

const server: NotificationPreferences = {
  locationAlerts: false,
  movieReady: false,
  quietStart: 22,
  quietEnd: 8,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => ({
      preferences: useNotificationPreferences(),
      writer: useUpdateNotificationPreferences(),
    }),
    { wrapper },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  mockGet.mockResolvedValue(server);
});

describe('useNotificationPreferences', () => {
  it('is unknown until the server answers, then holds the account’s values', async () => {
    const answer = deferred<NotificationPreferences>();
    mockGet.mockReturnValue(answer.promise);
    const { result } = await render();

    expect(result.current.preferences).toBeUndefined();
    await act(async () => answer.resolve({ ...server, movieReady: true }));

    await waitFor(() =>
      expect(result.current.preferences).toEqual({ ...server, movieReady: true }),
    );
  });

  it('does not ask the server while signed out', async () => {
    mockSignedIn = false;
    const { result } = await render();

    expect(result.current.preferences).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('useUpdateNotificationPreferences', () => {
  it('shows the change at once and keeps the server’s answer', async () => {
    const answer = deferred<NotificationPreferences>();
    mockUpdate.mockReturnValue(answer.promise);
    const { result } = await render();
    await waitFor(() => expect(result.current.preferences).toBeDefined());

    let took: Promise<boolean> | undefined;
    await act(async () => {
      took = result.current.writer.update({ quietStart: 23 });
    });
    await waitFor(() => expect(result.current.preferences?.quietStart).toBe(23));
    expect(mockUpdate).toHaveBeenCalledWith({ quietStart: 23 });

    await act(async () => answer.resolve({ ...server, quietStart: 23, quietEnd: 9 }));

    await expect(took).resolves.toBe(true);
    await waitFor(() =>
      expect(result.current.preferences).toEqual({ ...server, quietStart: 23, quietEnd: 9 }),
    );
    expect(result.current.writer.error).toBeNull();
  });

  it('puts a refused change back, says so, and re-reads', async () => {
    mockUpdate.mockRejectedValue(new Error('offline'));
    const { result } = await render();
    await waitFor(() => expect(result.current.preferences).toBeDefined());
    mockGet.mockClear();

    let took: boolean | undefined;
    await act(async () => {
      took = await result.current.writer.update({ movieReady: true });
    });

    expect(took).toBe(false);
    await waitFor(() => expect(result.current.preferences?.movieReady).toBe(false));
    // 알림 설정을 바꾸지 못했어요. 다시 시도해 주세요.
    expect(result.current.writer.error).toBe('알림 설정을 바꾸지 못했어요. 다시 시도해 주세요.');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  });

  it('does not let an older answer put back a value a newer change replaced', async () => {
    const first = deferred<NotificationPreferences>();
    const second = deferred<NotificationPreferences>();
    mockUpdate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = await render();
    await waitFor(() => expect(result.current.preferences).toBeDefined());

    // Two taps on the stepper: 22 → 23 → 0.
    await act(async () => {
      void result.current.writer.update({ quietStart: 23 });
      void result.current.writer.update({ quietStart: 0 });
    });
    await act(async () => second.resolve({ ...server, quietStart: 0 }));
    await act(async () => first.resolve({ ...server, quietStart: 23 }));

    await waitFor(() => expect(result.current.preferences?.quietStart).toBe(0));
  });

  it('changes nothing before the preferences have loaded', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { result } = await render();

    let took: boolean | undefined;
    await act(async () => {
      took = await result.current.writer.update({ movieReady: true });
    });

    expect(took).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
