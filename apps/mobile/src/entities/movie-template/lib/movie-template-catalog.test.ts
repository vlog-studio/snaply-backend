import { MovieBgmCatalog, MovieSnapLimit, MovieStyleCatalog } from '@/entities/movie';

import { MovieTemplateCatalog } from './movie-template-catalog';

describe('MovieTemplateCatalog', () => {
  it('gives every template a unique id', () => {
    const ids = MovieTemplateCatalog.map((template) => template.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(MovieTemplateCatalog.map((template) => [template.id, template] as const))(
    '%s fits inside one movie and names a real style and track',
    (_id, template) => {
      expect(template.slots.length).toBeGreaterThan(0);
      expect(template.slots.length).toBeLessThanOrEqual(MovieSnapLimit);
      expect(MovieStyleCatalog.map((style) => style.id)).toContain(template.style);
      expect(MovieBgmCatalog.map((track) => track.id)).toContain(template.bgm);
    },
  );

  it.each(MovieTemplateCatalog.map((template) => [template.id, template] as const))(
    '%s gives every slot a unique id and something to shoot',
    (_id, template) => {
      const slotIds = template.slots.map((slot) => slot.id);

      expect(new Set(slotIds).size).toBe(slotIds.length);
      template.slots.forEach((slot) => {
        expect(slot.label.length).toBeGreaterThan(0);
        expect(slot.hint.length).toBeGreaterThan(0);
      });
    },
  );
});
