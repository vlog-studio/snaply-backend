import { act, renderHook } from '@testing-library/react-native';

import type { Movie } from '@/entities/movie';

import { draftConfirmation, useEditDraft, type EditDraftState } from './use-edit-draft';

const mockStartMovieFromDraft = jest.fn();

jest.mock('@/entities/movie', () => ({ MovieSnapLimit: 10 }));
jest.mock('@/features/compose-movie', () => ({
  useComposeMovie: () => ({ startMovieFromDraft: mockStartMovieFromDraft }),
}));

const ConfirmLabel = '자동으로 편집하기'; // 자동으로 편집하기
const RetryLabel = '다시 시도'; // 다시 시도
const NewMovieLabel = '이 스냅으로 새 무비'; // 이 스냅으로 새 무비

beforeEach(() => jest.clearAllMocks());

describe('draftConfirmation', () => {
  const picks = ['s1', 's2'];

  it('asks for the draft until something goes wrong', () => {
    expect(draftConfirmation({ kind: 'idle' }, picks)).toEqual({
      label: ConfirmLabel,
      disabled: false,
      busy: false,
      action: 'draft',
    });
  });

  it('cannot be pressed again while a request is out', () => {
    expect(draftConfirmation({ kind: 'busy' }, picks)).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  it('offers the same request again when it may pass', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'unreachable', picks };
    expect(draftConfirmation(state, picks)).toMatchObject({
      label: RetryLabel,
      action: 'draft',
      disabled: false,
    });
  });

  it('offers the hand-made movie once today’s drafts are used up', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'limit', picks };
    expect(draftConfirmation(state, picks)).toMatchObject({
      label: NewMovieLabel,
      action: 'snaps',
      disabled: false,
    });
  });

  it('cannot make the hand-made movie from more picks than a movie holds', () => {
    const many = Array.from({ length: 11 }, (_, index) => `s${index}`);
    const state: EditDraftState = { kind: 'failed', refused: 'limit', picks: many };
    expect(draftConfirmation(state, many)).toMatchObject({ action: 'snaps', disabled: true });
  });

  it('forgets a failure once the picks change', () => {
    const state: EditDraftState = { kind: 'failed', refused: 'unreachable', picks };
    expect(draftConfirmation(state, [...picks, 's3'])).toMatchObject({ label: ConfirmLabel });
    expect(draftConfirmation(state, [...picks, 's3']).notice).toBeUndefined();
  });
});

describe('useEditDraft', () => {
  const movie = { id: 'm1' } as Movie;

  it('hands the movie on and returns to idle', async () => {
    mockStartMovieFromDraft.mockResolvedValue({ movie });
    const onMovie = jest.fn();
    const { result } = await renderHook(() => useEditDraft(onMovie));

    await act(async () => result.current.start(['s1']));

    expect(onMovie).toHaveBeenCalledWith(movie);
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('remembers why it failed and for which picks', async () => {
    mockStartMovieFromDraft.mockResolvedValue({ refused: 'limit' });
    const onMovie = jest.fn();
    const picks = ['s1'];
    const { result } = await renderHook(() => useEditDraft(onMovie));

    await act(async () => result.current.start(picks));

    expect(result.current.state).toEqual({ kind: 'failed', refused: 'limit', picks });
    expect(onMovie).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first request is out — one movie, not two', async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockStartMovieFromDraft.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const onMovie = jest.fn();
    const { result } = await renderHook(() => useEditDraft(onMovie));

    let first: Promise<void> | undefined;
    await act(async () => {
      first = result.current.start(['s1']);
    });
    expect(result.current.state).toEqual({ kind: 'busy' });
    await act(async () => result.current.start(['s1']));
    await act(async () => {
      answer({ movie });
      await first;
    });

    expect(mockStartMovieFromDraft).toHaveBeenCalledTimes(1);
    expect(onMovie).toHaveBeenCalledTimes(1);
  });
});
