import {
  TransitionCatalog,
  transitionSpec,
  type CutTransition,
  type TransitionKind,
} from '@/entities/movie';

/** One row of the transition picker. `kind` undefined is 자동으로 고르기. */
export type TransitionPickerRow = {
  key: string;
  kind: TransitionKind | undefined;
  label: string;
  /** A state read-out under the label, when there is something to say. */
  note?: string;
  selected: boolean;
};

/**
 * The picker's rows for one boundary: 자동으로 고르기 first, then the
 * transitions in catalog order.
 *
 * The selected row is the user's pick, or 자동으로 고르기 when the boundary is
 * the automatic pick's (or not picked yet). Read-outs say what the user would
 * otherwise have to guess: what the automatic pick currently is, that it is
 * still being picked, and — when the choice does not fit its cuts (a crossfade
 * with no frames to spare plays as a dip, as the render will) — what it will
 * look like, rather than why.
 */
export function transitionPickerRows(
  current: CutTransition | undefined,
  playedKind: TransitionKind | undefined,
): TransitionPickerRow[] {
  const userKind = current?.owner === 'user' ? current.kind : undefined;
  const autoSelected = userKind === undefined;
  const shownAs = (kind: TransitionKind) =>
    playedKind !== undefined && playedKind !== kind
      ? `${transitionSpec(playedKind).label}로 보여요`
      : undefined;

  return [
    {
      key: 'auto',
      kind: undefined,
      label: '자동으로 고르기',
      note:
        current?.owner === 'ai'
          ? (shownAs(current.kind) ?? `지금 ${transitionSpec(current.kind).label}`)
          : autoSelected
            ? '고르는 중'
            : undefined,
      selected: autoSelected,
    },
    ...TransitionCatalog.map((spec) => ({
      key: spec.kind,
      kind: spec.kind,
      label: spec.label,
      note: userKind === spec.kind ? shownAs(spec.kind) : undefined,
      selected: userKind === spec.kind,
    })),
  ];
}
