import { useMemo } from 'react';

import type { Snap } from './snap';
import { useSnaps } from './snap-store';

/**
 * A reference to a snap, as a movie's cut list stores it.
 *
 * Declared structurally rather than imported from `entities/movie`: the shape is
 * the entire contract, and describing it here is what keeps the two entities
 * independent as the layer rules require — no cross-import, no `@x`. Any
 * `{ snapId, order }` satisfies it.
 */
type SnapRefLike = { snapId: string; order: number };

/** Snaps keyed by id, so many movies' references resolve in a single pass. */
export type SnapIndex = ReadonlyMap<string, Snap>;

/** Stable empty result, so an empty movie does not re-render its consumers. */
const NoSnaps: Snap[] = [];

function indexSnapsById(snaps: readonly Snap[]): SnapIndex {
  return new Map(snaps.map((snap) => [snap.id, snap]));
}

/**
 * Resolves snap references to the snaps they point at, ordered by each
 * reference's `order`.
 *
 * A reference whose snap is gone from the library is skipped. That is the part
 * worth keeping in one place: deleting an original leaves every movie that
 * pointed at it holding a reference to nothing, and the studio board, the movie
 * grid, and a movie's cut list all have to agree about what that movie now
 * holds.
 *
 * `order` is only ever a sort key, so gaps and duplicates in it are harmless.
 */
export function snapsByRefs(refs: readonly SnapRefLike[] | undefined, index: SnapIndex): Snap[] {
  if (!refs || refs.length === 0) return NoSnaps;
  return [...refs]
    .sort((left, right) => left.order - right.order)
    .map((ref) => index.get(ref.snapId))
    .filter((snap): snap is Snap => snap !== undefined);
}

/**
 * Reactive index of the whole library. For a consumer resolving several movies
 * at once — the movie shelf summarizes every movie it draws — so the library is
 * walked once rather than once per movie.
 */
export function useSnapIndex(): SnapIndex {
  const snaps = useSnaps();
  return useMemo(() => indexSnapsById(snaps), [snaps]);
}
