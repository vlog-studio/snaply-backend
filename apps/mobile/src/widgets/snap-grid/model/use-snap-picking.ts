import { useCallback, useState } from 'react';

/** Where the picks are headed, and how much of it is already spoken for. */
export type SnapPickTarget = {
  /** Snaps the target already holds — picking one of these takes no new room. */
  heldIds: ReadonlySet<string>;
  /** How many snaps the target already holds. */
  heldCount: number;
  /** The most the target can ever hold. */
  capacity: number;
  /**
   * What to tell the user about a pick that does not fit. The target owns the
   * wording because only it can name itself; `room` is how many snaps it could
   * still take, and zero means there is no room at all.
   */
  describeRefusal: (room: number) => string;
};

export type SnapPicking = {
  /** The picked ids in pick order — the order the target receives them in. */
  picked: string[];
  /** How many more snaps the target can take. */
  room: number;
  /** Set while the last pick was refused, or by the screen after a failed commit. */
  notice: string | undefined;
  /** Picks a snap, or takes it back. A pick past the room left is refused. */
  toggle: (snapId: string) => void;
  /** Takes back specific picks, leaving the rest and the notice alone. */
  drop: (snapIds: readonly string[]) => void;
  /** Drops every pick, keeping the screen in picking mode. */
  clear: () => void;
  /** Drops the picks and the notice — the state a screen leaves picking in. */
  reset: () => void;
  /** Says something about the picks that only the screen could know. */
  announce: (message: string | undefined) => void;
};

/**
 * Picking snaps for a target that can only hold so many.
 *
 * Two screens pick from the same library into different targets — the studio's
 * tray and a movie's cut list — and these are the rules they share. Picks are an
 * ordered list rather than a set, because the number drawn on a cell is its
 * position and that position becomes the target's order. A pick past the room
 * left is refused with a notice rather than silently dropped, because the
 * ten-snap cap is the product's one hard constraint and this is the moment it
 * bites (concept §5). And snaps the target already holds are free: picking one
 * adds nothing, so it can never be the pick that hits the cap.
 */
export function useSnapPicking(target: SnapPickTarget): SnapPicking {
  const { heldIds, heldCount, capacity, describeRefusal } = target;
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();

  const room = Math.max(capacity - heldCount, 0);

  const toggle = useCallback(
    (snapId: string) => {
      if (picked.includes(snapId)) {
        setNotice(undefined);
        setPicked(picked.filter((id) => id !== snapId));
        return;
      }
      const wouldTake = picked.filter((id) => !heldIds.has(id)).length;
      if (!heldIds.has(snapId) && wouldTake >= room) {
        setNotice(describeRefusal(room));
        return;
      }
      setNotice(undefined);
      setPicked([...picked, snapId]);
    },
    [picked, heldIds, room, describeRefusal],
  );

  const drop = useCallback((snapIds: readonly string[]) => {
    setPicked((current) => current.filter((snapId) => !snapIds.includes(snapId)));
  }, []);

  const clear = useCallback(() => setPicked([]), []);

  const reset = useCallback(() => {
    setPicked([]);
    setNotice(undefined);
  }, []);

  return { picked, room, notice, toggle, drop, clear, reset, announce: setNotice };
}
