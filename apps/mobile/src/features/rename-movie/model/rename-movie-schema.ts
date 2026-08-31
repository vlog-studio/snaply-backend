import { z } from 'zod';

import { MovieTitleMaxLength } from '@/entities/movie';

/**
 * What the rename sheet accepts.
 *
 * A blank name is valid: the movie falls back to the day it was started, the same
 * rule that named it in the first place (`entities/movie/lib/movie-title.ts`).
 * The length rule is checked here as well as capped on the input, because a paste
 * arrives past the cap without ever being typed.
 */
export const renameMovieSchema = z.object({
  title: z.string().max(MovieTitleMaxLength, `${MovieTitleMaxLength}자까지 쓸 수 있어요.`),
});

export type RenameMovieValues = z.infer<typeof renameMovieSchema>;
