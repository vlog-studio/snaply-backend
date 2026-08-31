import { create } from 'zustand';

/**
 * The shell's bottom-chrome switch.
 *
 * A screen occasionally replaces the bottom chrome with an action bar of its
 * own — today the snap library's selection mode. It cannot simply draw over the
 * tab bar: the navigator paints the bar above every scene, so the tab items and
 * the capture button end up on top of the screen's own actions and swallow the
 * taps meant for them. The navigator and the screen also live in different
 * slices and different render trees, so neither can reach the other directly.
 *
 * This tiny store is their shared switch: the screen flips it, and the
 * navigator takes the tab bar and the capture button away for as long as it is
 * on. It stays deliberately business-agnostic — it knows that something owns
 * the bottom of the screen, not what or why.
 *
 * Whoever turns it on owns turning it back off. Leaving it on with no bar of
 * one's own on screen strands the app with no bottom chrome at all, so hiding
 * is best tied to the lifetime of the thing that replaces it (an effect's
 * cleanup) rather than flipped by hand at each enter and exit.
 */
type TabBarChromeState = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

/** Exported for test reset only; the slice's Public API is the two hooks below. */
export const useTabBarChromeStore = create<TabBarChromeState>()((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));

export function useTabBarHidden(): boolean {
  return useTabBarChromeStore((state) => state.hidden);
}

export function useSetTabBarHidden() {
  return useTabBarChromeStore((state) => state.setHidden);
}
