import { renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { Colors } from './theme';
import { useSetThemeMode } from './theme-mode';
import { ThemeScope } from './theme-scope';
import { useResolvedColorScheme, useTheme } from './use-theme';

const mockUseColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'dark');

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  useColorScheme: () => mockUseColorScheme(),
}));

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

async function setMode(mode: 'system' | 'light' | 'dark') {
  const { result } = await renderHook(() => useSetThemeMode());
  result.current(mode);
}

afterEach(async () => {
  mockUseColorScheme.mockReturnValue('dark');
  await setMode('system');
});

describe('useResolvedColorScheme', () => {
  it('follows the OS appearance in system mode', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useResolvedColorScheme());
    expect(result.current).toBe('light');
  });

  it('falls back to dark when the OS scheme is unknown', async () => {
    mockUseColorScheme.mockReturnValue(null);
    const { result } = await renderHook(() => useResolvedColorScheme());
    expect(result.current).toBe('dark');
  });

  it.each(['light', 'dark'] as const)(
    'ignores the OS appearance when the mode is fixed to "%s"',
    async (mode) => {
      mockUseColorScheme.mockReturnValue(mode === 'light' ? 'dark' : 'light');
      await setMode(mode);
      const { result } = await renderHook(() => useResolvedColorScheme());
      expect(result.current).toBe(mode);
    },
  );

  it('lets a ThemeScope pin override both the mode and the OS', async () => {
    mockUseColorScheme.mockReturnValue('light');
    await setMode('light');
    const wrapper = ({ children }: PropsWithChildren) => (
      <ThemeScope scheme="dark">{children}</ThemeScope>
    );
    const { result } = await renderHook(() => useResolvedColorScheme(), { wrapper });
    expect(result.current).toBe('dark');
  });
});

describe('useTheme', () => {
  it('returns the palette of the resolved scheme', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(Colors.light);
  });
});
