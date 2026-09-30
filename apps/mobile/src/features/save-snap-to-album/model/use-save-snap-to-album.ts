import { useCallback, useEffect, useRef, useState } from 'react';

import type { Snap } from '@/entities/snap';

import { saveSnapToAlbum, type AlbumSaveOutcome } from './save-snap-to-album';

/** Where the save of the snap on screen stands. */
export type AlbumSaveState = 'idle' | 'saving' | AlbumSaveOutcome;

/**
 * The 앨범에 저장 action on one snap at a time (SNAP-17): a tap on the snap
 * the user is looking at, asking for the permission when the device needs one.
 *
 * The state belongs to the snap it was run on, so a player that moves on to
 * another snap reads `idle` for it; `reset` forgets it when the player closes,
 * so a later visit can save again. Nothing is remembered past that on purpose —
 * the app cannot see the album, and a copy the user deleted there would still
 * read as saved.
 */
export function useSaveSnapToAlbum() {
  const isMounted = useRef(true);
  const inFlight = useRef(false);
  const [current, setCurrent] = useState<{ snapId: string; state: AlbumSaveState }>();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const save = useCallback(async (snap: Snap): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setCurrent({ snapId: snap.id, state: 'saving' });
    try {
      const outcome = await saveSnapToAlbum(snap, { ask: true });
      if (isMounted.current) setCurrent({ snapId: snap.id, state: outcome });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const stateOf = useCallback(
    (snapId: string): AlbumSaveState => (current?.snapId === snapId ? current.state : 'idle'),
    [current],
  );

  const reset = useCallback(() => {
    if (!inFlight.current) setCurrent(undefined);
  }, []);

  return { save, stateOf, reset };
}
