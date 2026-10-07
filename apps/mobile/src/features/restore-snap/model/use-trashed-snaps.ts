import { useQuery } from '@tanstack/react-query';

import { useIsAuthenticated } from '@/entities/session';

import { trashedSnapQueries } from '../api/trashed-snaps.queries';

import type { TrashedSnap } from './trashed-snap';

export type TrashedSnapsState = {
  /** `undefined` until the server has answered. */
  snaps: TrashedSnap[] | undefined;
  failed: boolean;
  retry: () => void;
};

/** The account's 최근 삭제 — deleted snaps that can still come back (SNAP-20). */
export function useTrashedSnaps(): TrashedSnapsState {
  const isAuthenticated = useIsAuthenticated();
  const query = useQuery({ ...trashedSnapQueries.list(), enabled: isAuthenticated });
  return {
    snaps: query.data,
    failed: query.isError && query.data === undefined,
    retry: () => void query.refetch(),
  };
}
