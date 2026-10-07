import { MovieGenerationGate } from '@/features/compose-movie';
import { useNotificationPreferences } from '@/features/notification-settings';

/**
 * Headless bridge between the 무비 완성 알림 setting and the generation runner.
 * Composes the two features at the app layer (they must not import each other):
 * reads the account's `movieReady` preference from notification-settings and
 * lets compose-movie announce a job that **failed** while the user was
 * elsewhere. A job completing is the server's push to announce (2026-09-12),
 * judged by the same preference on the server. Until the preference has loaded
 * nothing is announced.
 */
export function MovieGenerationBridge() {
  const announce = useNotificationPreferences()?.movieReady === true;
  return <MovieGenerationGate announce={announce} />;
}
