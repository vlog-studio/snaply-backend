import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { secureStorage } from '@/shared/lib/secure-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeModeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const useThemeModeStore = create<ThemeModeState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'snaply.theme-mode',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);

export function useThemeMode(): ThemeMode {
  return useThemeModeStore((state) => state.mode);
}

export function useSetThemeMode() {
  return useThemeModeStore((state) => state.setMode);
}
