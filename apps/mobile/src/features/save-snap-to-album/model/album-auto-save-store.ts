import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { secureStorage } from '@/shared/lib/secure-storage';

/**
 * The 자동 앨범 저장 preference (SNAP-18): whether a snap shot here also goes
 * to the album as it is saved.
 *
 * The device's, not the account's — the album it fills is this device's, and a
 * second account signing in here fills the same one. Off until the user turns it
 * on (root docs/decisions/snap-album-save-and-device-delete.md ②): on by default,
 * every 3-second clip would pile up in the gallery unasked.
 */
type AlbumAutoSaveState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

// Exported for co-located tests only; app code uses the hooks below.
export const useAlbumAutoSaveStore = create<AlbumAutoSaveState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'snaply.album-auto-save',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
);

export function useAlbumAutoSaveEnabled(): boolean {
  return useAlbumAutoSaveStore((state) => state.enabled);
}

export function useSetAlbumAutoSaveEnabled(): (enabled: boolean) => void {
  return useAlbumAutoSaveStore((state) => state.setEnabled);
}

/**
 * Whether automatic saving is on, once the stored choice has been read back.
 * A capture right after launch must not be skipped because the switch still
 * reads its default: a copy the user believes exists and does not is the
 * failure this setting is there to prevent.
 */
export async function isAlbumAutoSaveOn(): Promise<boolean> {
  const { persist: persisted } = useAlbumAutoSaveStore;
  if (!persisted.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsubscribe = persisted.onFinishHydration(() => {
        unsubscribe();
        resolve();
      });
      // Finished between the check above and the subscription.
      if (persisted.hasHydrated()) {
        unsubscribe();
        resolve();
      }
    });
  }
  return useAlbumAutoSaveStore.getState().enabled;
}
