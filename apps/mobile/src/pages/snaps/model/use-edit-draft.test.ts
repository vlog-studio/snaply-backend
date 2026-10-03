import { act, renderHook } from '@testing-library/react-native';

import type { Movie } from '@/entities/movie';

import { draftConfirmation, useEditDraft, type EditDraftState } from './use-edit-draft';

const mockStartMovieFromDraft = jest.fn();

jest.mock('@/entities/movie', () => ({ MovieSnapLimit: 10, MovieDraftSnapLimit: 30 }));
jest.mock('@/features/compose-movie', () => ({
  useComposeMovie: () => ({ startMovieFromDraft: mockStartMovieFromDraft }),
}));

const ConfirmLabel = '\uC790\uB3D9\uC73C\uB85C \uD3B8\uC9D1\uD558\uAE30'; // 자동으로 편집하기
const RetryLabel = '\uB2E4\uC2DC \uC2DC\uB3C4'; // 다시 시도
const NewMovieLabel = '\uC774 \uC2A4\uB0C5\uC73C\uB85C \uC0C8 \uBB34\uBE44'; // 이 스냅으로 새 무비
// 자동 편집에는 스냅 N개까지 넣을 수 있어요. M개를 빼 주세요.
const dropNotice = (limit: number, extra: number) =>
  `\uC790\uB3D9 \uD3B8\uC9D1\uC5D0\uB294 \uC2A4\uB0C5 ${limit}\uAC1C\uAE4C\uC9C0 \uB123\uC744 \uC218 \uC788\uC5B4\uC694. ${extra}\uAC1C\uB97C \uBE7C \uC8FC\uC138\uC694.`;
// 고른 스냅을 자동 편집에 쓸 수 없어요. 다른 스냅을 골라 주세요.
const UnavailableNotice =
  '\uACE0\uB978 \uC2A4\uB0C5\uC744 \uC790\uB3D9 \uD3B8\uC9D1\uC5D0 \uC4F8 \uC218 \uC5C6\uC5B4\uC694. \uB2E4\uB978 \uC2A4\uB0C5\uC744 \uACE8\uB77C \uC8FC\uC138\uC694.';
// 자동 편집에 넣기엔 스냅이 너무 많아요. 몇 개를 빼 주세요.
const UnknownCapNotice =
  '\uC790\uB3D9 \uD3B8\uC9D1\uC5D0 \uB123\uAE30\uC5D4 \uC2A4\uB0C5\uC774 \uB108\uBB34 \uB9CE\uC544\uC694. \uBA87 \uAC1C\uB97C \uBE7C \uC8FC\uC138\uC694.';

/** The app's own cap, as the entity mock above states it. */
const Limit = 30;

const snapIds = (count: number) => Array.from({ length: count }, (_, index) => `s${index}`);

beforeEach(() => jest.clearAllMocks());

describe('draftConfirmation', () => {
  const picks = ['s1', 's2'];

  it('asks for the draft until something goes wrong', () => {
    expect(draftConfirmation({ kind: 'idle' }, picks, Limit)).toEqual({
      label: ConfirmLabel,
      disabled: false,
      busy: false,
      action: 'draft',
    });
  });

  it('cannot be pressed again while a request is out', () => {
    expect(draftConfirmation({ kind: 'busy' }, picks, Limit)).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  it('offers the same request again when it may pass', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'unreachable', picks };
    expect(draftConfirmation(state, picks, Limit)).toMatchObject({
      label: RetryLabel,
      action: 'draft',
      disabled: false,
    });
  });

  it('offers the hand-made movie once today\u2019s drafts are used up', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'limit', picks };
    expect(draftConfirmation(state, picks, Limit)).toMatchObject({
      label: NewMovieLabel,
      action: 'snaps',
      disabled: false,
    });
  });

  it('cannot make the hand-made movie from more picks than a movie holds', () => {
    const many = snapIds(11);
    const state: EditDraftState = { kind: 'failed', refused: 'limit', picks: many };
    expect(draftConfirmation(state, many, Limit)).toMatchObject({
      action: 'snaps',
      disabled: true,
    });
  });

  it('forgets a failure once the picks change', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'unreachable', picks };
    expect(draftConfirmation(state, [...picks, 's3'], Limit)).toMatchObject({
      label: ConfirmLabel,
    });
    expect(draftConfirmation(state, [...picks, 's3'], Limit).notice).toBeUndefined();
  });

  it('waits for fewer picks past the draft\u2019s cap and says how many to drop', () => {
    expect(draftConfirmation({ kind: 'idle' }, snapIds(25), 20)).toEqual({
      label: ConfirmLabel,
      notice: dropNotice(20, 5),
      disabled: true,
      busy: false,
      action: 'draft',
    });
  });

  it('keeps asking for fewer after a refusal that named no cap — retrying would only fail again', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'too-many', picks };
    expect(draftConfirmation(state, picks, Limit)).toMatchObject({
      label: ConfirmLabel,
      notice: UnknownCapNotice,
      disabled: true,
    });
    expect(draftConfirmation(state, ['s1'], Limit)).toMatchObject({ disabled: false });
  });
});

describe('draftConfirmation when the server has none of the picks', () => {
  const picks = ['s1', 's2'];

  it('asks for other snaps instead of offering the same request again', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'unavailable', picks };
    expect(draftConfirmation(state, picks, Limit)).toMatchObject({
      label: ConfirmLabel,
      notice: UnavailableNotice,
      disabled: true,
    });
  });

  it('lets the new picks be tried once they change', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'unavailable', picks };
    expect(draftConfirmation(state, ['s3'], Limit)).toMatchObject({ disabled: false });
  });
});

describe('useEditDraft', () => {
  const movie = { id: 'm1' } as Movie;

  it('resolves to the movie it made and returns to idle', async () => {
    mockStartMovieFromDraft.mockResolvedValue({ movie });
    const { result } = await renderHook(() => useEditDraft());

    let made: Movie | undefined;
    await act(async () => {
      made = await result.current.start(['s1']);
    });

    expect(made).toBe(movie);
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('remembers why it failed and for which picks', async () => {
    mockStartMovieFromDraft.mockResolvedValue({ refused: 'limit' });
    const picks = ['s1'];
    const { result } = await renderHook(() => useEditDraft());

    let made: Movie | undefined;
    await act(async () => {
      made = await result.current.start(picks);
    });

    expect(result.current.state).toEqual({ kind: 'failed', refused: 'limit', picks });
    expect(made).toBeUndefined();
  });

  it('ignores a second tap while the first request is out — one movie, not two', async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockStartMovieFromDraft.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = await renderHook(() => useEditDraft());

    let first: Promise<Movie | undefined> | undefined;
    await act(async () => {
      first = result.current.start(['s1']);
    });
    expect(result.current.state).toEqual({ kind: 'busy' });
    let second: Movie | undefined;
    await act(async () => {
      second = await result.current.start(['s1']);
    });
    let made: Movie | undefined;
    await act(async () => {
      answer({ movie });
      made = await first;
    });

    expect(mockStartMovieFromDraft).toHaveBeenCalledTimes(1);
    expect(second).toBeUndefined();
    expect(made).toBe(movie);
  });

  it('starts from the app\u2019s own cap and takes the lower one the server names', async () => {
    mockStartMovieFromDraft.mockResolvedValue({ refused: 'too-many', max: 20 });
    const picks = snapIds(25);
    const { result } = await renderHook(() => useEditDraft());
    expect(result.current.limit).toBe(Limit);

    await act(async () => {
      await result.current.start(picks);
    });

    expect(result.current.limit).toBe(20);
    // Not 다시 시도: the same picks would be refused again.
    expect(draftConfirmation(result.current.state, picks, result.current.limit)).toMatchObject({
      label: ConfirmLabel,
      notice: dropNotice(20, 5),
      disabled: true,
    });
  });
});
