import { onSnapReconcileRequest, requestSnapReconcile } from './snap-reconcile-requests';

describe('requestSnapReconcile', () => {
  it('reaches the mounted reconcile until it unsubscribes', () => {
    const pass = jest.fn();
    const unsubscribe = onSnapReconcileRequest(pass);

    requestSnapReconcile();
    unsubscribe();
    requestSnapReconcile();

    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no reconcile is mounted (signed out, mock mode)', () => {
    expect(() => requestSnapReconcile()).not.toThrow();
  });
});
