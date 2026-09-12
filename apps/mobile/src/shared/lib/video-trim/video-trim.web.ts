import type { ProbedVideo, TrimmedVideo, TrimWindowMs } from './trimmed-video';

// Videos never persist on web (the file adapter lists none), so there is no
// local file to trim or to measure.
export async function trimVideo(_sourceUri: string, _window: TrimWindowMs): Promise<TrimmedVideo> {
  throw new Error('Video trimming is not supported on web.');
}

export async function probeVideo(_sourceUri: string): Promise<ProbedVideo | undefined> {
  return undefined;
}
