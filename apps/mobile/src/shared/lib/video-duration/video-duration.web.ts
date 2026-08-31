// Videos never persist on web (the file adapter lists none), so there is no
// local file whose length could be measured.
export async function readVideoDuration(_uri: string): Promise<number | undefined> {
  return undefined;
}
