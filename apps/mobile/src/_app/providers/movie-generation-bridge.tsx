import { MovieGenerationGate } from '@/features/compose-movie';
import { useMovieReadyEnabled } from '@/features/notification-settings';

/**
 * Headless bridge between the 무비 완성 알림 setting and the generation runner.
 * Composes the two features at the app layer (they must not import each other):
 * reads the `movieReady` preference from notification-settings and lets
 * compose-movie announce a job that ended while the user was elsewhere.
 */
export function MovieGenerationBridge() {
  const announce = useMovieReadyEnabled();
  return <MovieGenerationGate announce={announce} />;
}
