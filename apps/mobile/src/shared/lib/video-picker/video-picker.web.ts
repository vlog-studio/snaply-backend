import type { PickedVideo } from './picked-video';

// Videos never persist on web (the file adapter lists none), so a picked video
// would have nowhere to go; the entry points do not render there.
export async function pickVideoFromLibrary(): Promise<PickedVideo | undefined> {
  return undefined;
}
