import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getAlbumPermission, requestAlbumPermission } from '@/shared/lib/media-library';

import { useAlbumAutoSaveEnabled, useSetAlbumAutoSaveEnabled } from './album-auto-save-store';

export type AlbumAutoSave = {
  enabled: boolean;
  /** The device does not let the app add to the album, so the switch saves nothing. */
  blocked: boolean;
  setEnabled: (next: boolean) => void;
};

const NotGranted = { granted: false, canAskAgain: false };

/**
 * The 자동 앨범 저장 switch, permission included (SNAP-18).
 *
 * Turning it on is the moment to ask the OS — a control the user just touched —
 * and a refusal leaves it off and says so rather than looking on while saving
 * nothing. Where adding needs no permission (Android 11+) it simply turns on.
 *
 * A grant withdrawn later in the OS settings is noticed when the switch is read
 * and on every return to the app, so the screen can say the copies stopped;
 * the stored choice stays on, and saving resumes once the grant is back.
 */
export function useAlbumAutoSave(): AlbumAutoSave {
  const enabled = useAlbumAutoSaveEnabled();
  const setStoredEnabled = useSetAlbumAutoSaveEnabled();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const check = () => {
      void getAlbumPermission()
        .catch(() => NotGranted)
        .then((permission) => {
          if (!cancelled) setBlocked(!permission.granted);
        });
    };
    check();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [enabled]);

  const setEnabled = (next: boolean) => {
    if (!next) {
      setBlocked(false);
      setStoredEnabled(false);
      return;
    }
    void (async () => {
      const permission = await requestAlbumPermission().catch(() => NotGranted);
      setBlocked(!permission.granted);
      setStoredEnabled(permission.granted);
    })();
  };

  return { enabled, blocked, setEnabled };
}
