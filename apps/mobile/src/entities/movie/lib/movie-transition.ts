import type { CutTransition, SnapRef, TransitionKind } from '../model/movie';

/**
 * Cut transitions as the app needs them: the catalog of kinds and the rule that
 * fits a chosen transition to its two cuts.
 *
 * **A copy, checked against the original.** The source is the server's
 * vocabulary (root `packages/shared-types/src/transition-vocabulary.json`) and
 * its resolution rule (`transition.ts` there, mirrored by the worker). The
 * contract package is kept out of the app bundle for now (root backlog B-5), so
 * the values are restated here and `movie-transition.test.ts` compares them with
 * the JSON and runs the shared resolution fixture — the same fixture the API and
 * the worker run. A drift fails `verify`, because a preview that fits a
 * transition differently from the render is a preview of a different movie.
 */

type DurationRange = { min: number; max: number; default: number };

export type TransitionTiming = 'boundary' | 'overlap';
export type TransitionEasing = 'linear' | 'easeOutCubic';

export type TransitionSpec = {
  kind: TransitionKind;
  /** What the picker calls it. */
  label: string;
  timing: TransitionTiming;
  durationMs: DurationRange | null;
  /** For a boundary transition: how much of it each cut carries (sums to 1). */
  split?: { outgoing: number; incoming: number };
  /** The flash or dip color. */
  color?: string;
  /** Where a zoom punch starts, as a scale of the frame. */
  scaleFrom?: number;
  easing: TransitionEasing;
  fallback: TransitionKind | null;
};

/** In the vocabulary's `order` — the order the picker lists them in. */
export const TransitionCatalog: readonly TransitionSpec[] = [
  {
    kind: 'hardcut',
    label: '바로 넘기기',
    timing: 'boundary',
    durationMs: null,
    easing: 'linear',
    fallback: null,
  },
  {
    kind: 'crossfade',
    label: '겹쳐 녹이기',
    timing: 'overlap',
    durationMs: { min: 200, max: 800, default: 500 },
    easing: 'linear',
    fallback: 'dip',
  },
  {
    kind: 'dip',
    label: '검게 넘기기',
    timing: 'boundary',
    durationMs: { min: 200, max: 600, default: 400 },
    split: { outgoing: 0.5, incoming: 0.5 },
    color: '#000000',
    easing: 'linear',
    fallback: 'hardcut',
  },
  {
    kind: 'flash',
    label: '번쩍 넘기기',
    timing: 'boundary',
    durationMs: { min: 100, max: 400, default: 200 },
    split: { outgoing: 0.5, incoming: 0.5 },
    color: '#FFFFFF',
    easing: 'linear',
    fallback: 'hardcut',
  },
  {
    kind: 'zoompunch',
    label: '확대하며 넘기기',
    timing: 'boundary',
    durationMs: { min: 150, max: 400, default: 300 },
    split: { outgoing: 0, incoming: 1 },
    scaleFrom: 1.08,
    easing: 'easeOutCubic',
    fallback: 'hardcut',
  },
];

const SpecByKind = new Map(TransitionCatalog.map((spec) => [spec.kind, spec]));

export function transitionSpec(kind: TransitionKind): TransitionSpec {
  return SpecByKind.get(kind) ?? TransitionCatalog[0];
}

export function isTransitionKind(value: string): value is TransitionKind {
  return SpecByKind.has(value as TransitionKind);
}

/** A transition reduced to what plays: its kind and length. */
export type PlayedTransition = { kind: TransitionKind; durationMs: number };

/** The two cuts either side of a boundary, in milliseconds. */
export type TransitionBoundary = {
  outgoing: { cutMs: number; spareAfterMs: number };
  incoming: { cutMs: number; spareBeforeMs: number };
};

function capacityMs(spec: TransitionSpec, boundary: TransitionBoundary): number {
  const { outgoing, incoming } = boundary;
  const caps: number[] = [];
  if (spec.timing === 'overlap') {
    caps.push(
      2 * outgoing.spareAfterMs,
      2 * incoming.spareBeforeMs,
      outgoing.cutMs,
      incoming.cutMs,
    );
  } else if (spec.split) {
    if (spec.split.outgoing > 0) caps.push(outgoing.cutMs / 2 / spec.split.outgoing);
    if (spec.split.incoming > 0) caps.push(incoming.cutMs / 2 / spec.split.incoming);
  }
  return Math.floor(Math.max(0, Math.min(...caps)));
}

/**
 * The transition that actually fits this boundary: shortened to what the cut
 * lengths and spare frames allow, and below its minimum replaced by its
 * fallback at that one's default length (crossfade → dip → hardcut). The same
 * rule as the server's `resolveTransition`; `hardcut` plays as length 0.
 */
export function resolveCutTransition(
  chosen: { kind: TransitionKind; durationMs?: number },
  boundary: TransitionBoundary,
): PlayedTransition {
  const spec = transitionSpec(chosen.kind);
  if (spec.durationMs === null) return { kind: 'hardcut', durationMs: 0 };
  const durationMs = Math.min(
    chosen.durationMs ?? spec.durationMs.default,
    capacityMs(spec, boundary),
  );
  if (durationMs >= spec.durationMs.min) return { kind: spec.kind, durationMs };
  const fallback = spec.fallback ?? 'hardcut';
  return resolveCutTransition({ kind: fallback }, boundary);
}

/**
 * The transition that applies to the boundary after `refs[index]` (refs in play
 * order), or `undefined` when the server is to pick it — none was read back yet,
 * or the one stored was chosen for a different next cut.
 */
export function transitionAfter(
  refs: readonly SnapRef[],
  index: number,
): CutTransition | undefined {
  const next = refs[index + 1];
  const transition = refs[index]?.transition;
  if (!next || !transition || transition.toSnapId !== next.snapId) return undefined;
  return transition;
}

/**
 * The cut list with the boundary after `index` set to the user's pick at its
 * default length, or handed back to the server (`kind` undefined: "AI 에게
 * 맡기기"). Handing back drops the stored value rather than marking it, so the
 * boundary reads as pending until the server's pick is read back.
 */
export function withTransitionAfter(
  refs: readonly SnapRef[],
  index: number,
  kind: TransitionKind | undefined,
): SnapRef[] {
  const next = refs[index + 1];
  if (!next) return [...refs];
  return refs.map((ref, position) => {
    if (position !== index) return ref;
    if (kind === undefined) {
      const { transition: _dropped, ...rest } = ref;
      return rest;
    }
    const range = transitionSpec(kind).durationMs;
    const transition: CutTransition = {
      kind,
      ...(range ? { durationMs: range.default } : null),
      owner: 'user',
      toSnapId: next.snapId,
    };
    return { ...ref, transition };
  });
}

/**
 * Whether two cut lists (both in play order) hand over the same way at every
 * boundary — the chosen kinds and lengths that apply, whoever chose them. The
 * cut composition itself is `sameCuts`'s question; this is the other half of
 * "would the stage play the same thing".
 */
export function sameTransitions(left: readonly SnapRef[], right: readonly SnapRef[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((_, index) => {
    const a = transitionAfter(left, index);
    const b = transitionAfter(right, index);
    return a?.kind === b?.kind && a?.durationMs === b?.durationMs;
  });
}
