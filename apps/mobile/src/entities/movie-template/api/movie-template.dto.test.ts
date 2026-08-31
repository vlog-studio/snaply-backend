import { MovieTemplateCatalog } from '../lib/movie-template-catalog';
import { mapMovieTemplate, movieTemplateCatalogDtoSchema } from './movie-template.dto';

function dto(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cafe',
    name: '카페 한 곳',
    description: '다녀온 카페를 소개하는 다섯 장면',
    style: '감성',
    bgm: 'sunny-side',
    slots: [{ id: 'front', label: '외관', hint: '가게 앞' }],
    ...over,
  };
}

describe('movieTemplateCatalogDtoSchema', () => {
  it('accepts the payload the backend documents', () => {
    const parsed = movieTemplateCatalogDtoSchema.parse({
      updatedAt: '2026-08-19T00:00:00.000Z',
      templates: [dto()],
    });

    expect(parsed.templates).toHaveLength(1);
  });

  it('strips the scoring internals if they ever leak into the payload', () => {
    // The server keeps `matchHints` out of the response on purpose; Zod makes
    // sure a future leak cannot reach the app and quietly become a dependency.
    const parsed = movieTemplateCatalogDtoSchema.parse({
      updatedAt: '2026-08-19T00:00:00.000Z',
      templates: [
        dto({ slots: [{ id: 'front', label: '외관', hint: '가게 앞', matchHints: {} }] }),
      ],
    });

    expect(parsed.templates[0].slots[0]).toEqual({ id: 'front', label: '외관', hint: '가게 앞' });
  });
});

describe('mapMovieTemplate', () => {
  it.each([
    ['감성', 'emotional'],
    ['여행', 'travel'],
    ['일상', 'daily'],
  ] as const)('reads the %s preset as %s', (preset, style) => {
    expect(mapMovieTemplate(dto({ style: preset }))?.style).toBe(style);
  });

  it('skips a template whose preset this build does not know', () => {
    // The server does not filter these — it cannot know which presets a given
    // build understands, and filtering there would hide the template from the
    // newer builds that do.
    expect(mapMovieTemplate(dto({ style: '빈티지' }))).toBeUndefined();
  });

  it('skips a template with no slots, since there is nothing to shoot', () => {
    expect(mapMovieTemplate(dto({ slots: [] }))).toBeUndefined();
  });

  it('maps the seeded catalog back to what the build ships', () => {
    // The ids and copy are seeded from this constant, so a mapped server row and
    // the offline fallback must describe the same template.
    const shipped = MovieTemplateCatalog.find((template) => template.id === 'cafe');
    const mapped = mapMovieTemplate(
      dto({
        slots: shipped?.slots.map((slot) => ({ ...slot })),
      }),
    );

    expect(mapped).toEqual(shipped);
  });
});
