import type { Href } from 'expo-router';

/**
 * Navigation targets more than one screen sends the user to.
 *
 * A target used from a single place stays inline as Expo Router's typed
 * pathname object — that form is already type-checked against the route tree,
 * so wrapping it would only add indirection. What earns a builder here is a
 * target whose *shape* is repeated: the same pathname and the same params
 * assembled in several screens, where a typo in one of them is a bug the other
 * copies do not catch.
 */

/** One movie, at any status. Every surface that draws a movie opens this. */
export function movieHref(movieId: string): Href {
  return { pathname: '/movie/[id]', params: { id: movieId } };
}

/**
 * The snap library in picking mode — the studio's 새 무비 row and the movie
 * tab's empty state are the same act and must land in the same place.
 */
export function snapPickerHref(): Href {
  return { pathname: '/snaps', params: { select: '1', at: pickingRequest() } };
}

/**
 * The snap library picking for the edit draft (MOV-21) — the studio's 자동 편집
 * row. The same picking surface with a different cap and a different confirm.
 */
export function draftPickerHref(): Href {
  return { pathname: '/snaps', params: { select: 'draft', at: pickingRequest() } };
}

/**
 * A fresh token per picking request. The Snap tab stays mounted, and navigation
 * does not re-apply nested params equal to the ones it last had — so without it
 * the same row tapped a second time opens the tab browsing instead of picking.
 */
let pickingRequests = 0;
function pickingRequest(): string {
  pickingRequests += 1;
  return `${Date.now()}-${pickingRequests}`;
}
