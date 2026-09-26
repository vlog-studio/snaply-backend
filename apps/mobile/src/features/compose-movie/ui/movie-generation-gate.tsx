import { useGenerationRunner, type GenerationRunnerOptions } from '../model/use-generation-runner';
import { useRunCreditRefresh } from '../model/use-run-credit-refresh';

export type MovieGenerationGateProps = GenerationRunnerOptions;

/**
 * Headless mount point for movie generation. Render once high in the tree so a
 * job keeps running while the user browses other tabs, and is picked back up on
 * the next app start if they left before it finished. It also keeps the credit
 * balance in step with the runs, since each start and each refund moves it.
 */
export function MovieGenerationGate({ announce }: MovieGenerationGateProps): null {
  useGenerationRunner({ announce });
  useRunCreditRefresh();
  return null;
}
