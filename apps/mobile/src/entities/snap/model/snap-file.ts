import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';

import { deleteLocalRecording } from '@/shared/lib/recording-files';
import {
  deleteServerSnapFile,
  downloadServerSnapFile,
  isServerSnapFile,
  serverSnapFileExists,
} from '@/shared/lib/server-snap-files';

import { getServerSnapSource } from '../api/get-server-snap-source';
import type { Snap } from './snap';

/**
 * Which server snaps are being fetched, or failed to be, this session. Not
 * persisted: a fetch belongs to this process, and a failure is worth retrying
 * on the next visit. A snap with no state here is either on the device or not
 * yet asked for — the file itself is the record of which.
 */
type SnapFileState = 'fetching' | 'failed';

const useSnapFileStore = create<{ states: Record<string, SnapFileState> }>(() => ({
  states: {},
}));

function setFileState(snapId: string, state: SnapFileState | undefined): void {
  useSnapFileStore.setState((current) => {
    if (current.states[snapId] === state) return current;
    const { [snapId]: _previous, ...rest } = current.states;
    return { states: state === undefined ? rest : { ...rest, [snapId]: state } };
  });
}

const inFlight = new Map<string, Promise<void>>();

/** Whether the snap's video can be played from this device right now. */
export function isSnapFileLocal(snap: Snap): boolean {
  return snap.origin !== 'server' || serverSnapFileExists(snap.uri);
}

/**
 * Brings a server snap's video onto the device (SNAP-15: fetched when first
 * played). A snap shot here, or one already fetched, resolves at once. Two
 * callers asking for the same snap share one download.
 *
 * The address is asked for at the moment of the fetch — it is signed and good
 * for an hour, so one remembered from the list would be dead by the time the
 * user presses play.
 */
export function fetchSnapFile(snap: Snap): Promise<void> {
  if (isSnapFileLocal(snap)) return Promise.resolve();
  const pending = inFlight.get(snap.id);
  if (pending) return pending;
  setFileState(snap.id, 'fetching');
  const request = (async () => {
    const source = await getServerSnapSource(snap.id);
    if (!source) throw new Error(`No playable copy for ${snap.id}`);
    await downloadServerSnapFile(source, snap.uri);
  })()
    .then(
      () => setFileState(snap.id, undefined),
      (error: unknown) => {
        setFileState(snap.id, 'failed');
        throw error;
      },
    )
    .finally(() => inFlight.delete(snap.id));
  inFlight.set(snap.id, request);
  return request;
}

/**
 * Deletes a snap's video from the device, wherever it lives: a recording of
 * this device's own, or the fetched copy of a snap from elsewhere. Each place
 * refuses paths outside itself, so a wrong URI fails instead of reaching some
 * other file.
 */
export async function deleteSnapFile(uri: string): Promise<void> {
  if (isServerSnapFile(uri)) deleteServerSnapFile(uri);
  else await deleteLocalRecording(uri);
}

export type SnapFiles = {
  /** Some of the snaps are still being fetched. */
  fetching: boolean;
  /** Some could not be fetched; nothing retries until {@link SnapFiles.retry}. */
  failed: boolean;
  retry: () => void;
};

/**
 * Makes sure every one of `snaps` can be played here, fetching the server
 * snaps that are not, one at a time — a screen that plays a movie's cuts needs
 * all of them, and one download at a time leaves the connection to the one the
 * user is waiting on. A failed fetch stays failed until `retry`, so a screen
 * without a connection does not spin through the list forever.
 */
export function useSnapFiles(snaps: readonly Snap[]): SnapFiles {
  const states = useSnapFileStore((store) => store.states);

  // Re-read on every state change: a fetch that finished leaves no state
  // behind, and the file is then what says it is here.
  const missing = useMemo(
    () => snaps.filter((snap) => !isSnapFileLocal(snap)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snaps, states],
  );
  const failed = missing.some((snap) => states[snap.id] === 'failed');
  const toFetch = missing.filter((snap) => states[snap.id] !== 'failed');
  const fetchKey = toFetch.map((snap) => snap.id).join(',');

  useEffect(() => {
    if (toFetch.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const snap of toFetch) {
        if (cancelled) return;
        try {
          await fetchSnapFile(snap);
        } catch (error) {
          if (__DEV__) console.warn(`[snap] could not fetch ${snap.id}:`, String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `fetchKey` names the snaps to fetch; the array itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  const retry = useCallback(() => {
    for (const snap of snaps) {
      if (useSnapFileStore.getState().states[snap.id] === 'failed')
        setFileState(snap.id, undefined);
    }
  }, [snaps]);

  return { fetching: toFetch.length > 0, failed, retry };
}
