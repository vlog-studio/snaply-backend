import { renderHook } from '@testing-library/react-native';

import type { Snap } from '@/entities/snap';

import { useTemplateOffers } from './use-template-offers';

const mockSnaps = jest.fn<Snap[], []>();

jest.mock('@/entities/snap', () => ({
  useSnaps: () => mockSnaps(),
}));

// The catalog is a server read now. What this hook owns is the *order* it puts
// the templates in, so the source is pinned to the shipped catalog rather than
// dragged through a query client — `use-movie-templates.test.ts` covers the read.
jest.mock('@/entities/movie-template', () => ({
  useMovieTemplates: () =>
    jest.requireActual('@/entities/movie-template/lib/movie-template-catalog').MovieTemplateCatalog,
}));

const Noon = new Date('2026-08-12T12:00:00+09:00').getTime();
const MinuteMs = 60 * 1000;
const seongsu = { latitude: 37.5445, longitude: 127.0557 };

function makeSnap(id: string, minutesFromNoon: number): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec: 3,
    capturedAt: Noon + minutesFromNoon * MinuteMs,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    place: seongsu,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnaps.mockReturnValue([]);
});

function renderOffers() {
  return renderHook(() => useTemplateOffers());
}

describe('useTemplateOffers', () => {
  it('offers every template in the catalog, with what the library fills', async () => {
    const { result } = await renderOffers();

    expect(result.current).toHaveLength(4);
    expect(result.current.every((offer) => offer.filled === 0)).toBe(true);
  });

  // The studio's row fits two cards and a sliver, so the order decides which
  // templates a user ever sees.
  it('puts the template closest to being filled first', async () => {
    mockSnaps.mockReturnValue([
      makeSnap('a', 0),
      makeSnap('b', 10),
      makeSnap('c', 20),
      makeSnap('d', 30),
    ]);

    const { result } = await renderOffers();

    // 하루 요약 asks for four and has them; 카페 한 곳 is one short; 동네 산책 and
    // 나들이 are both two short, and the shorter-then-catalog tie-break keeps 산책 ahead.
    expect(result.current.map((offer) => offer.template.id)).toEqual([
      'day',
      'cafe',
      'walk',
      'trip',
    ]);
    expect(result.current[0]).toMatchObject({ filled: 4, slotCount: 4 });
  });

  it('falls back to the shortest template when the library fills none of them', async () => {
    const { result } = await renderOffers();

    expect(result.current.map((offer) => offer.template.id)).toEqual([
      'day',
      'cafe',
      'walk',
      'trip',
    ]);
  });
});
