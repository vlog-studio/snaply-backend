import { useGenerationRunner, type GenerationRunnerOptions } from '../model/use-generation-runner';

export type MovieGenerationGateProps = GenerationRunnerOptions;

/**
 * Headless mount point for movie generation. Render once high in the tree so a
 * job keeps running while the user browses other tabs, and is picked back up on
 * the next app start if they left before it finished.
 */
export function MovieGenerationGate({ announce }: MovieGenerationGateProps): null {
  useGenerationRunner({ announce });
  return null;
}
