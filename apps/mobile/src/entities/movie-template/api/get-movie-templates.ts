import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import { MovieTemplateCatalog } from '../lib/movie-template-catalog';
import type { MovieTemplate } from '../model/movie-template';
import { mapMovieTemplate, movieTemplateCatalogDtoSchema } from './movie-template.dto';

async function getFromApi(signal?: AbortSignal): Promise<MovieTemplate[]> {
  const dto = await apiRequest('/movie-templates', {
    method: 'GET',
    schema: movieTemplateCatalogDtoSchema,
    signal,
  });
  // Order is the server's, and it is kept: the studio's card row shows two and a
  // sliver, so which templates a user ever sees is decided by this order.
  return dto.templates.flatMap((template) => {
    const mapped = mapMovieTemplate(template);
    return mapped ? [mapped] : [];
  });
}

/**
 * Fetch the template catalog (`GET /movie-templates`).
 *
 * Routes to the built-in catalog in mock mode — the same constant that serves as
 * the offline fallback, so the two modes cannot disagree about what a template is.
 *
 * A caller that gets a rejection here is expected to fall back rather than show
 * an error: a template screen with no templates is a dead end, and the build
 * already carries four of them.
 */
export function getMovieTemplates(signal?: AbortSignal): Promise<MovieTemplate[]> {
  return USE_MOCK_API ? Promise.resolve([...MovieTemplateCatalog]) : getFromApi(signal);
}
