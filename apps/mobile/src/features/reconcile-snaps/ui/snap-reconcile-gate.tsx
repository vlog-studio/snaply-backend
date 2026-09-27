import { useSnapReconcile } from '../model/use-snap-reconcile';

/**
 * Headless mount point for the snap reconcile. Render once high in the tree,
 * after the library scope is bound, so the account's snaps from elsewhere
 * arrive whichever screen is open.
 */
export function SnapReconcileGate(): null {
  useSnapReconcile();
  return null;
}
