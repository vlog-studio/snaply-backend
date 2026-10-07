/**
 * A way for a screen to ask for a reconcile pass now, rather than at the next
 * return to the foreground — after bringing snaps back from 최근 삭제
 * (SNAP-20), when the restored snap should reappear in the library at once.
 *
 * The mounted `useSnapReconcile` listens; with none mounted (signed out, mock
 * mode) a request does nothing, as a pass would.
 */
const listeners = new Set<() => void>();

export function requestSnapReconcile(): void {
  listeners.forEach((listener) => listener());
}

export function onSnapReconcileRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
