import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useSnapSyncEntries, type Snap } from '@/entities/snap';
import { USE_MOCK_API } from '@/shared/config/api';

import { recommendationQueries } from '../api/recommendation.queries';
import { spreadAcrossSlots } from '../lib/match-template';

/**
 * The server's per-request candidate cap. Sending more is refused, so the app
 * samples down to it rather than letting the request fail.
 *
 * Kept as a constant rather than read from the 400's `max`: the app has to
 * decide how many to send *before* it can be told. The error still carries the
 * real number, which is what makes a change on the server visible in a log
 * rather than silent.
 */
const MaxCandidates = 12;

/** Below this there is nothing to choose between, and the local order is already the answer. */
const MinCandidates = 2;

/** What the server proposes for one slot. */
export type SlotRecommendation = {
  snapId: string;
  /** 0–1 slot fit — how well this snap suits *this position*, not what it shows. */
  score: number;
};

export type TemplateRecommendation = Readonly<Record<string, SlotRecommendation>>;

/**
 * The server's proposal for a template's slots, or `undefined` while there is
 * none.
 *
 * `undefined` is the normal state, not an error state: mock mode, no network,
 * the endpoint switched off, an outing whose snaps have not finished uploading,
 * an analysis that is still running. Every one of those resolves the same way —
 * the caller keeps the local match it already drew. Nothing here surfaces a
 * failure to the user, because none of them cost the user anything.
 *
 * **Only uploaded snaps can be candidates.** The server analyses what it has;
 * a snap still on its way up is not a candidate and keeps whatever place the
 * local match gave it. That is what lets the screen answer instantly for someone
 * who just came back from the camera.
 */
export function useTemplateRecommendation(
  templateId: string | undefined,
  sessionSnaps: readonly Snap[] | undefined,
): TemplateRecommendation | undefined {
  const syncEntries = useSnapSyncEntries();

  const { candidates, snapIdByVideoId } = useMemo(() => {
    const uploaded = (sessionSnaps ?? []).flatMap((snap) => {
      const entry = syncEntries[snap.id];
      return entry?.status === 'uploaded' ? [{ snapId: snap.id, videoId: entry.videoId }] : [];
    });
    // Over the cap, take an evenly spaced sample that keeps the first and last —
    // the same rule the local match uses to fit an outing into slots, so a long
    // walk still starts and ends where it did.
    const sampled =
      uploaded.length > MaxCandidates
        ? spreadAcrossSlots(uploaded, MaxCandidates).flatMap((item) => (item ? [item] : []))
        : uploaded;

    return {
      candidates: sampled.map((item) => item.videoId),
      snapIdByVideoId: new Map(sampled.map((item) => [item.videoId, item.snapId])),
    };
  }, [sessionSnaps, syncEntries]);

  const enabled = !USE_MOCK_API && templateId !== undefined && candidates.length >= MinCandidates;

  const request = useQuery({
    ...recommendationQueries.request(templateId ?? '', candidates),
    enabled,
  });
  const result = useQuery({
    ...recommendationQueries.result(request.data ?? ''),
    enabled: enabled && request.data !== undefined,
  });

  return useMemo(() => {
    const dto = result.data;
    if (!dto || dto.status !== 'done') return undefined;

    const assigned = dto.slots.flatMap((slot) => {
      if (!slot.videoId) return [];
      const snapId = snapIdByVideoId.get(slot.videoId);
      // A video the app can no longer tie back to a local snap (deleted between
      // the request and the answer) is dropped rather than left as a dangling id.
      return snapId ? [[slot.slotId, { snapId, score: slot.score ?? 0 }] as const] : [];
    });

    // An answer that fills nothing is the same as no answer: keep the local match.
    return assigned.length > 0 ? Object.fromEntries(assigned) : undefined;
  }, [result.data, snapIdByVideoId]);
}
