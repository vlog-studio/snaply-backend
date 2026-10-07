import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether this device holds an OS grant, read with `check` (check-only — it
 * must never prompt) on mount, whenever `recheckKey` changes, and on every
 * return to the foreground — the way back from the system settings a blocked
 * notice points to. `undefined` until the first read lands.
 */
export function useDeviceGrant(
  check: () => Promise<boolean>,
  recheckKey?: unknown,
): boolean | undefined {
  const [granted, setGranted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void check()
        .then((value) => {
          if (!cancelled) setGranted(value);
        })
        .catch(() => {
          if (!cancelled) setGranted(undefined);
        });
    };
    read();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') read();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [check, recheckKey]);

  return granted;
}
