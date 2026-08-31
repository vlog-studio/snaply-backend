import { createContext, useContext, type PropsWithChildren } from 'react';

type ForcedColorScheme = 'light' | 'dark';

const ForcedColorSchemeContext = createContext<ForcedColorScheme | null>(null);

/**
 * Pins every `useTheme`/`useResolvedColorScheme` call in the subtree to one
 * scheme, ignoring the user's theme mode and the OS setting. For screens whose
 * ground is a video surface — the viewfinder — where chrome must stay legible
 * over near-black regardless of the app theme.
 */
export function ThemeScope({ children, scheme }: PropsWithChildren<{ scheme: ForcedColorScheme }>) {
  return (
    <ForcedColorSchemeContext.Provider value={scheme}>{children}</ForcedColorSchemeContext.Provider>
  );
}

export function useForcedColorScheme(): ForcedColorScheme | null {
  return useContext(ForcedColorSchemeContext);
}
