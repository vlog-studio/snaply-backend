import { act, renderHook } from '@testing-library/react-native';

import { useSetThemeMode, useThemeMode } from './theme-mode';

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('theme mode store', () => {
  afterEach(async () => {
    // The store is a module-level singleton; reset it so tests stay independent.
    const { result } = await renderHook(() => useSetThemeMode());
    await act(async () => result.current('system'));
  });

  it('defaults to following the system setting', async () => {
    const { result } = await renderHook(() => useThemeMode());
    expect(result.current).toBe('system');
  });

  it.each(['light', 'dark', 'system'] as const)(
    'updates the mode to "%s" via the setter',
    async (mode) => {
      const { result } = await renderHook(() => ({
        mode: useThemeMode(),
        setMode: useSetThemeMode(),
      }));

      await act(async () => result.current.setMode(mode));

      expect(result.current.mode).toBe(mode);
    },
  );
});
