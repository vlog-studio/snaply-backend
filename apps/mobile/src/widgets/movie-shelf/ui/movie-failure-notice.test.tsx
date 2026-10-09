import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { GenerationOutcome } from '@/features/compose-movie';

import { MovieFailureNotice } from './movie-failure-notice';

const mockStartGeneration = jest.fn<Promise<GenerationOutcome>, [string]>();

jest.mock('@/features/compose-movie', () => ({
  // The card words a refusal with the feature's own line, so the screen and the
  // card can never say different things; take the real one.
  generationRefusalHeadline: jest.requireActual('@/features/compose-movie')
    .generationRefusalHeadline,
  useComposeMovie: () => ({ startGeneration: mockStartGeneration }),
}));

// 다시 만들기 (the retry's accessibility label)
const retryLabel = '\uB2E4\uC2DC \uB9CC\uB4E4\uAE30';
// 시간이 오래 걸려 만들지 못했어요. 다시 시도해 주세요.
const reason =
  '\uC2DC\uAC04\uC774 \uC624\uB798 \uAC78\uB824 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.';
// 다른 무비를 만드는 중이에요.
const busyLine = '\uB2E4\uB978 \uBB34\uBE44\uB97C \uB9CC\uB4DC\uB294 \uC911\uC774\uC5D0\uC694.';
// 크레딧이 부족해요 · 40/100.
const creditLine = '\uD06C\uB808\uB527\uC774 \uBD80\uC871\uD574\uC694 \u00B7 40/100.';
// 연결하지 못했어요.
const unreachableLine = '\uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.';

function renderNotice() {
  return render(<MovieFailureNotice movieId="m1" error={reason} snapCount={3} />);
}

function pressRetry() {
  return fireEvent.press(screen.getByRole('button', { name: retryLabel }));
}

describe('MovieFailureNotice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // E-24: a retry refused on the board or the grid used to change nothing on
  // screen, which MOV-11 made an everyday answer.
  it.each<[string, GenerationOutcome, string]>([
    [
      'another movie is being made',
      { started: false, refused: 'busy', generatingMovieId: 'm2' },
      busyLine,
    ],
    [
      'the balance is short',
      { started: false, refused: 'no-credit', shortfall: { balance: 40, required: 100 } },
      creditLine,
    ],
  ])('says why a retry did not start when %s', async (_label, outcome, line) => {
    mockStartGeneration.mockResolvedValue(outcome);
    await renderNotice();

    await pressRetry();

    expect(mockStartGeneration).toHaveBeenCalledWith('m1');
    expect(screen.getByText(line)).toBeOnTheScreen();
    // In the reason's place, so a grid tile keeps its height.
    expect(screen.queryByText(reason)).toBeNull();
  });

  it('answers each press with that press\u2019s own outcome', async () => {
    mockStartGeneration
      .mockResolvedValueOnce({ started: false, refused: 'busy' })
      .mockResolvedValueOnce({ started: false, refused: 'unreachable' });
    await renderNotice();

    await pressRetry();
    await pressRetry();

    expect(screen.getByText(unreachableLine)).toBeOnTheScreen();
    expect(screen.queryByText(busyLine)).toBeNull();
  });

  it('starts one run per press while a start is in flight', async () => {
    let answer: (outcome: GenerationOutcome) => void = () => {};
    mockStartGeneration.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await renderNotice();

    await pressRetry();
    await pressRetry();
    expect(mockStartGeneration).toHaveBeenCalledTimes(1);

    await act(async () => answer({ started: false, refused: 'busy' }));
    mockStartGeneration.mockResolvedValueOnce({ started: false, refused: 'busy' });
    await pressRetry();
    expect(mockStartGeneration).toHaveBeenCalledTimes(2);
  });
});
