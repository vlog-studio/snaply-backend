import { useQuery } from '@tanstack/react-query';

import { movieTemplateQueries } from '../api/movie-template.queries';
import { MovieTemplateCatalog } from '../lib/movie-template-catalog';
import type { MovieTemplate } from './movie-template';

/**
 * The templates this build can offer, server-first.
 *
 * **Never empty and never loading.** The catalog that ships with the build
 * answers immediately, and the server's answer replaces it once it arrives. A
 * user offline, on a build older than the server's newest preset, or hitting a
 * catalog endpoint that is down sees the same screen they saw before the catalog
 * moved to the server — which is the whole reason the constant stayed.
 *
 * The consequence to keep in mind: the first paint of a cold start is the
 * fallback, so a template the server added is one render late. Templates change
 * when someone ships a migration, so that is a cost worth the absence of a
 * loading state on the app's home screen.
 */
export function useMovieTemplates(): readonly MovieTemplate[] {
  const { data } = useQuery(movieTemplateQueries.catalog());
  // An empty server catalog is not a reason to show nothing — it more likely
  // means a seed did not run than that the product has no templates.
  return data && data.length > 0 ? data : MovieTemplateCatalog;
}

/** One template by id, or `undefined` when this build has no such template. */
export function useMovieTemplate(id: string | undefined): MovieTemplate | undefined {
  const templates = useMovieTemplates();
  if (!id) return undefined;
  return templates.find((template) => template.id === id);
}
