import { z } from 'zod';

import type { ServerSnap, ServerSnapFate } from '../model/server-snap';

/**
 * The wire shape of a snap in `GET /videos?kind=source`. Only the fields the
 * app maps are declared; Zod strips the rest. `status` stays a `string` — a
 * value the server adds later must not fail the whole read.
 */
export const serverSnapDtoSchema = z.object({
  id: z.string(),
  status: z.string(),
  thumbnailUrl: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  durationMs: z.number().nullable(),
  capturedAt: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  clientId: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
type ServerSnapDto = z.infer<typeof serverSnapDtoSchema>;

export const serverSnapPageDtoSchema = z.object({
  items: z.array(serverSnapDtoSchema),
  nextCursor: z.string().nullable(),
});

export const serverSnapLookupDtoSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      state: z.string(),
      removalReason: z.string().nullable(),
    }),
  ),
});
type ServerSnapLookupItemDto = z.infer<typeof serverSnapLookupDtoSchema>['items'][number];

function epochOf(iso: string | null): number | undefined {
  if (iso === null) return undefined;
  const epoch = Date.parse(iso);
  return Number.isNaN(epoch) ? undefined : epoch;
}

export function mapServerSnap(dto: ServerSnapDto): ServerSnap {
  const measuredMs = dto.durationMs ?? undefined;
  const width = dto.width ?? undefined;
  const height = dto.height ?? undefined;
  const hasSize = width !== undefined && height !== undefined && width > 0 && height > 0;
  const thumbnailUrl = dto.thumbnailUrl ?? undefined;
  const clientId = dto.clientId ?? undefined;
  const expiresAt = epochOf(dto.expiresAt);
  return {
    videoId: dto.id,
    ready: dto.status === 'ready',
    // SNAP-10: a snap registered before the capture time was sent sorts by its
    // upload time, on the server and here alike.
    capturedAt: epochOf(dto.capturedAt) ?? epochOf(dto.createdAt) ?? 0,
    durationSec: measuredMs !== undefined ? measuredMs / 1000 : (dto.durationSeconds ?? 0),
    durationMeasured: measuredMs !== undefined,
    ...(hasSize ? { width, height } : null),
    ...(thumbnailUrl ? { thumbnailUrl } : null),
    ...(clientId ? { clientId } : null),
    ...(expiresAt !== undefined ? { expiresAt } : null),
  };
}

/**
 * `undefined` for an answer this build does not understand — the caller treats
 * it like no answer, which never deletes anything.
 */
export function mapServerSnapFate(dto: ServerSnapLookupItemDto): ServerSnapFate | undefined {
  if (dto.state === 'live') return { state: 'live' };
  if (dto.state !== 'removed') return undefined;
  if (dto.removalReason === 'expired') return { state: 'removed', reason: 'expired' };
  if (dto.removalReason === 'user' || dto.removalReason === null) {
    return { state: 'removed', reason: 'user' };
  }
  return undefined;
}
