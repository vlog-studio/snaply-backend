import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { RemoteMovie } from '../model/remote-movie';
import { mockListMovies } from './mock-movies';
import { mapRemoteMovie, moviePageDtoSchema, type SnapIdResolver } from './movie.dto';

/** The server's page cap; asking for the most per request keeps the read short. */
const PageSize = 50;

async function getFromApi(snapIdOf: SnapIdResolver, signal?: AbortSignal): Promise<RemoteMovie[]> {
  const items: RemoteMovie[] = [];
  let cursor: string | undefined;
  do {
    const page = await apiRequest('/movies', {
      method: 'GET',
      query: { limit: PageSize, ...(cursor ? { cursor } : null) },
      schema: moviePageDtoSchema,
      signal,
    });
    for (const dto of page.items) items.push(mapRemoteMovie(dto, snapIdOf));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

function getMock(snapIdOf: SnapIdResolver): Promise<RemoteMovie[]> {
  return Promise.resolve(mockListMovies().map((dto) => mapRemoteMovie(dto, snapIdOf)));
}

/**
 * Every movie the account holds on the server (`GET /movies`, all pages).
 *
 * Read whole rather than paged: the studio board and the movie grid draw the
 * entire library at once and sort it themselves, and an account's movies are
 * counted in dozens, not thousands. `snapIdOf` names the local snap behind each
 * server video — the upload state's knowledge, injected so this entity never
 * imports the snap entity.
 *
 * Routes to the mock until an API origin is configured.
 */
export function getMovies(snapIdOf: SnapIdResolver, signal?: AbortSignal): Promise<RemoteMovie[]> {
  return USE_MOCK_API ? getMock(snapIdOf) : getFromApi(snapIdOf, signal);
}
