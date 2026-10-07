import { z } from 'zod';

import type { TrashedSnap } from '../model/trashed-snap';

/** One item of `GET /videos/trash`. Only the fields the app maps are declared. */
const trashedSnapDtoSchema = z.object({
  id: z.string(),
  capturedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  deletedAt: z.string(),
  restorableUntil: z.string(),
});

export const trashListDtoSchema = z.object({ items: z.array(trashedSnapDtoSchema) });

export type TrashListDto = z.infer<typeof trashListDtoSchema>;

export function mapTrashedSnaps(dto: TrashListDto): TrashedSnap[] {
  return dto.items.map((item) => {
    const deletedAt = Date.parse(item.deletedAt);
    const capturedAt = item.capturedAt ? Date.parse(item.capturedAt) : Number.NaN;
    return {
      videoId: item.id,
      capturedAt: Number.isNaN(capturedAt) ? deletedAt : capturedAt,
      durationSec: (item.durationMs ?? 0) / 1000,
      ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : null),
      deletedAt,
      restorableUntil: Date.parse(item.restorableUntil),
    };
  });
}
