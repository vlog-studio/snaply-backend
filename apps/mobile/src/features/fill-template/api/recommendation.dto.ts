import { z } from 'zod';

/**
 * The wire shape of the recommendation endpoints.
 *
 * What the server sends back is a slot-to-video map and nothing else — no
 * summary, no tags, no reason line. The analysis behind it is an internal signal
 * for choosing snaps, not copy for a screen, and the payload is built that way
 * on purpose.
 */
export const recommendationAcceptedDtoSchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const recommendationDtoSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  /** `processing` until the candidates' analyses finish; then `done`. */
  status: z.string(),
  slots: z.array(
    z.object({
      slotId: z.string(),
      /** Null when nothing was worth putting in this slot — it stays empty. */
      videoId: z.string().nullable(),
      /**
       * 0–1 **slot fit**, not a claim about what the snap shows. The server is
       * explicit that a slot's name is shooting direction, so this number says
       * "this snap belongs in this position", never "this is an alley".
       */
      score: z.number().nullable(),
    }),
  ),
  // `excluded` is deliberately not mapped: the app already leaves a slot empty
  // when nothing fills it, and the per-candidate reason is operator diagnostics.
});

export type RecommendationDto = z.infer<typeof recommendationDtoSchema>;
