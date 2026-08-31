import { useColorScheme } from 'react-native';

import { Colors } from './theme';
import { useThemeMode } from './theme-mode';
import { useForcedColorScheme } from './theme-scope';

// Resolution order: a `ThemeScope` pin wins (video surfaces stay dark), then
// the persisted theme-mode preference, then the OS appearance. An unknown OS
// scheme (null during startup) falls back to dark, matching the splash.
export function useResolvedColorScheme(): 'light' | 'dark' {
  const forced = useForcedColorScheme();
  const mode = useThemeMode();
  const systemScheme = useColorScheme();

  if (forced) return forced;
  if (mode !== 'system') return mode;
  return systemScheme === 'light' ? 'light' : 'dark';
}

export function useTheme() {
  return Colors[useResolvedColorScheme()];
}
