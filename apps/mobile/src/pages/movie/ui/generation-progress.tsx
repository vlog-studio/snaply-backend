import { StyleSheet, View } from 'react-native';

import { movieJobRatio, type Movie } from '@/entities/movie';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { ProgressRing } from './progress-ring';

export type GenerationProgressProps = {
  /** A movie a job owns; the page mounts this only while one does. */
  movie: Movie;
};

const RingSize = 132;

/** Before the first milestone arrives, and for a job stored without one. */
const QueuedStep = '작업을 기다리고 있어요';

/**
 * The progress the user came back to see — the ring and what the run is doing —
 * in the stage where the player otherwise sits. Leaving is expected and safe: the
 * job belongs to the movie, not to this screen (`MovieGenerationGate`), so the
 * ring picks up where it left off on the way back.
 *
 * **Both numbers are the backend's** (2026-08-07). The ring is filled to the
 * percentage the pipeline last published and the line under it is the stage it
 * named, in its own words. There is no local checklist any more: the five steps
 * this panel used to draw were paced by a clock against a table of durations that
 * stood for nothing, and a run's real stages are the backend's to change — a
 * table here would eventually show the wrong stage confidently. What the app
 * loses is the sense of a list being worked through; what it gains is that the
 * screen cannot be wrong about what is happening.
 *
 * Milestones are coarse (six over a whole run), so the ring holds still for
 * stretches. That is honest: nothing here knows how far into a stage the render
 * is, and interpolating would be inventing progress.
 */
export function GenerationProgress({ movie }: GenerationProgressProps) {
  const isRunning = movie.status === 'generating' && movie.job !== undefined;
  if (!isRunning || !movie.job) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.ringRow}>
        <ProgressRing progress={movieJobRatio(movie.job)} size={RingSize} />
      </View>
      <ThemedText type="heading" style={styles.centerText}>
        만드는 중…
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        {movie.job.step ?? QueuedStep}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.three, alignItems: 'center' },
  centerText: { textAlign: 'center' },
  ringRow: { alignItems: 'center', paddingVertical: Spacing.three },
});
