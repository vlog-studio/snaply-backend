import { fireEvent, render, screen } from '@testing-library/react-native';

import type { MovieSummary } from '@/widgets/movie-shelf';

import { MovieDeleteConfirm } from './movie-delete-confirm';

function makeSummary(overrides: Partial<MovieSummary> = {}): MovieSummary {
  return {
    id: 'm1',
    title: '\uBB34\uBE44 08-03', // 무비 08-03
    status: 'ready',
    style: 'daily',
    snapCount: 3,
    totalSec: 12,
    dateLabel: '\uC624\uB298', // 오늘
    coverUris: [],
    ...overrides,
  };
}

const singleHeading = '\uC774 \uBB34\uBE44\uB97C \uC9C0\uC6B8\uAE4C\uC694?'; // 이 무비를 지울까요?
const cancelLabel = '\uC0AD\uC81C \uCDE8\uC18C'; // 삭제 취소
// 지금 만드는 중인 작업도 함께 사라져요.
const generatingWarning =
  '\uC9C0\uAE08 \uB9CC\uB4DC\uB294 \uC911\uC778 \uC791\uC5C5\uB3C4 \uD568\uAED8 \uC0AC\uB77C\uC838\uC694.';

describe('MovieDeleteConfirm', () => {
  it('confirms a single movie by name', async () => {
    const onConfirm = jest.fn();
    await render(
      <MovieDeleteConfirm movies={[makeSummary()]} onCancel={jest.fn()} onConfirm={onConfirm} />,
    );

    expect(screen.getByText(singleHeading)).toBeTruthy();
    expect(screen.getByText('\uBB34\uBE44 08-03')).toBeTruthy(); // 무비 08-03

    // 무비 08-03 삭제
    await fireEvent.press(screen.getByRole('button', { name: '\uBB34\uBE44 08-03 \uC0AD\uC81C' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('counts a multi-selection and folds the unnamed rest', async () => {
    const movies = ['a', 'b', 'c', 'd', 'e'].map(
      (id) => makeSummary({ id, title: `\uBB34\uBE44 ${id}` }), // 무비 a…e
    );
    await render(<MovieDeleteConfirm movies={movies} onCancel={jest.fn()} onConfirm={jest.fn()} />);

    // 무비 5편을 지울까요?
    expect(screen.getByText('\uBB34\uBE44 5\uD3B8\uC744 \uC9C0\uC6B8\uAE4C\uC694?')).toBeTruthy();
    expect(screen.getByText('\uBB34\uBE44 c')).toBeTruthy(); // 무비 c
    expect(screen.queryByText('\uBB34\uBE44 d')).toBeNull(); // 무비 d
    expect(screen.getByText('\uC678 2\uD3B8')).toBeTruthy(); // 외 2편
    expect(screen.getByRole('button', { name: '5\uD3B8 \uC0AD\uC81C' })).toBeTruthy(); // 5편 삭제
  });

  it.each([
    ['ready', false],
    ['generating', true],
  ] as const)('with a %s movie, warns about a job in flight: %s', async (status, warned) => {
    await render(
      <MovieDeleteConfirm
        movies={[makeSummary(), makeSummary({ id: 'm2', status })]}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

    expect(screen.queryByText(generatingWarning) !== null).toBe(warned);
  });

  it('cancels without confirming', async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    await render(
      <MovieDeleteConfirm movies={[makeSummary()]} onCancel={onCancel} onConfirm={onConfirm} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
