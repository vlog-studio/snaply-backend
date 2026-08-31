import type { ApiError } from './api-error';

type ApiErrorListener = (error: ApiError) => void;

const listeners = new Set<ApiErrorListener>();

/**
 * Observe every `ApiError` thrown by `apiRequest`, whichever caller made the
 * request (React Query or a direct call). The transport stays domain-blind:
 * it only announces the normalized error, and an app-layer subscriber decides
 * what a given `code` means (e.g. `ACCOUNT_PENDING_DELETION` flips session
 * state). Returns an unsubscribe function.
 */
export function subscribeToApiErrors(listener: ApiErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the transport client only. A listener must never throw back into it. */
export function notifyApiError(error: ApiError): void {
  for (const listener of listeners) listener(error);
}
