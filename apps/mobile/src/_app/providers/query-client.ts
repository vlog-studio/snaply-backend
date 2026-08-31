import { QueryClient } from '@tanstack/react-query';

/**
 * The app-wide QueryClient. `_app` owns its creation and global cache/retry
 * policy; features and pages must not instantiate their own. Defaults are
 * conservative for a mobile client: a short stale window, no refetch on focus
 * (handled per-query where it matters), and limited retries.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
