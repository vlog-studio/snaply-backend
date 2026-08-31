import { useMemo } from 'react';

import { useMovieTemplates, type MovieTemplate } from '@/entities/movie-template';
import { useSnaps } from '@/entities/snap';

import { groupIntoSessions, pickBestSession } from '../lib/match-template';

export type TemplateOffer = {
  template: MovieTemplate;
  /** How many of its slots the library can fill right now. */
  filled: number;
  /** How many it asks for. */
  slotCount: number;
};

/**
 * Every template with how far the library gets through it — what the studio's
 * cards read out.
 *
 * The point of showing the shortfall rather than hiding templates that do not
 * fit is that the shortfall is the invitation: "4/6컷 있음" is the app naming
 * two shots the user could go take. A template the library cannot fill at all
 * still belongs on the shelf for the same reason.
 *
 * **Ordered by shortfall, not by the catalog** (2026-08-12). The studio draws
 * these as a horizontal row that fits two and a half cards, so catalog order
 * decided by luck which templates a user ever saw — a template the library can
 * fill today is worth more than the one that happens to be written first.
 * Templates the library fills equally are ordered by the shorter one, then by
 * the catalog, so the row stays stable while the library does.
 *
 * The catalog itself comes from the server now (`useMovieTemplates`), which
 * answers with the built-in one until the request lands — so the cards are drawn
 * from the first render and a template the server added simply appears when its
 * answer arrives.
 */
export function useTemplateOffers(): TemplateOffer[] {
  const snaps = useSnaps();
  const templates = useMovieTemplates();

  return useMemo(
    () =>
      templates
        .map((template) => {
          const slotCount = template.slots.length;
          const best = pickBestSession(groupIntoSessions(snaps), slotCount);
          return {
            template,
            filled: Math.min(best?.snaps.length ?? 0, slotCount),
            slotCount,
          };
        })
        .sort(
          (left, right) =>
            left.slotCount - left.filled - (right.slotCount - right.filled) ||
            left.slotCount - right.slotCount,
        ),
    [snaps, templates],
  );
}
