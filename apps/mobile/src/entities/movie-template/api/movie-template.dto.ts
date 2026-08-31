import { z } from 'zod';

import type { MovieStyle } from '@/entities/movie/@x/movie-template';

import type { MovieTemplate } from '../model/movie-template';

/**
 * The wire shape of `GET /movie-templates`.
 *
 * The catalog moved to the server so that a slot's **matching rules** and its
 * definition live on the same row; those rules are scoring internals and are
 * deliberately absent from this payload. Nothing here is a claim about a snap's
 * contents — `label` and `hint` are shooting direction for a person, same as
 * they were when the catalog was a local constant.
 */
const templateSlotDtoSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
});

export const movieTemplateDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // Free-form on the wire: the backend names its own edit presets and may add
  // one this build has never heard of. Narrowing here would fail the whole
  // response over a single unknown template.
  style: z.string(),
  bgm: z.string(),
  slots: z.array(templateSlotDtoSchema),
});

export const movieTemplateCatalogDtoSchema = z.object({
  updatedAt: z.string(),
  templates: z.array(movieTemplateDtoSchema),
});

export type MovieTemplateDto = z.infer<typeof movieTemplateDtoSchema>;

/**
 * The backend's preset names, as `POST /edit-jobs` spells them, mapped onto the
 * app's own `MovieStyle`.
 *
 * The reverse map lives in `features/compose-movie/api` because that is where
 * the app speaks the preset back out. Each direction sits in the `api` segment
 * that crosses that boundary rather than in one shared module — a runtime import
 * between entities is exactly what the boundary rules refuse.
 */
const StyleByPreset: Record<string, MovieStyle> = {
  감성: 'emotional',
  여행: 'travel',
  일상: 'daily',
};

/**
 * Map one wire template, or `undefined` when this build cannot render it.
 *
 * A template is dropped when its style is a preset the app does not know, or
 * when it has no slots. **The server does not filter these** — it cannot know
 * which presets a given build understands, and filtering server-side would hide
 * a new preset's templates from the newer apps that do understand it. So the
 * skipping happens here, per build.
 */
export function mapMovieTemplate(dto: MovieTemplateDto): MovieTemplate | undefined {
  const style = StyleByPreset[dto.style];
  if (!style || dto.slots.length === 0) return undefined;

  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    style,
    bgm: dto.bgm,
    slots: dto.slots.map((slot) => ({ id: slot.id, label: slot.label, hint: slot.hint })),
  };
}
