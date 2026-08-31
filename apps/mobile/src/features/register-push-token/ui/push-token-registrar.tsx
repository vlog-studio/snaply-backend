import { usePushTokenRegistration } from '../model/use-push-token';

/**
 * Headless mount point for push-token registration. Render once high in the tree
 * (it self-gates on authentication and the notification grant) so the token is
 * acquired and kept in sync for the whole authenticated session. `recheckKey`
 * re-runs the permission check when its value changes — the app layer passes a
 * signal that flips when a grant may have just landed.
 */
export function PushTokenRegistrar({ recheckKey }: { recheckKey?: unknown }): null {
  usePushTokenRegistration({ recheckKey });
  return null;
}
