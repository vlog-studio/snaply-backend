import { useMovieReadyEnabled } from '@/features/notification-settings';
import { PushTokenRegistrar } from '@/features/register-push-token';

/**
 * Headless bridge, the same shape as `GeofenceGate`: composes two features that
 * must not import each other. The registrar never prompts — it only checks the
 * notification grant — and the 무비 완성 알림 switch is today's one control
 * whose opt-in obtains that grant. Its stored preference flipping on therefore
 * means a grant may have just landed, so it is passed as the registrar's
 * `recheckKey` to re-run the check without waiting for the next app start.
 */
export function PushTokenGate() {
  const movieReadyEnabled = useMovieReadyEnabled();
  return <PushTokenRegistrar recheckKey={movieReadyEnabled} />;
}
