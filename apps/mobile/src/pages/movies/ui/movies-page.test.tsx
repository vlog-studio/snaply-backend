import { fireEvent, render, screen } from '@testing-library/react-native';

import type { MovieSummary } from '@/widgets/movie-shelf';

import { MoviesPage } from './movies-page';

const mockPush = jest.fn();
const mockDeleteMovie = jest.fn();
const mockShare = jest.fn();
const mockSetTabBarHidden = jest.fn();
let mockMovies: MovieSummary[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
}));

// The page and its sheets read safe-area insets — a native answer a test has
// no provider for.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/entities/movie', () => ({
  useDeleteMovie: () => mockDeleteMovie,
  useMovieById: () => undefined,
}));

jest.mock('@/features/share-movie', () => ({
  useShareMovie: () => ({ blocked: 'no-render', busy: false, failed: false, share: mockShare }),
  // The bar words the block from this table, so the mock has to carry it.
  ShareBlockMessages: {
    'no-render':
      '\uC544\uC9C1 \uC644\uC131 \uD30C\uC77C\uC774 \uB9CC\uB4E4\uC5B4\uC9C0\uC9C0 \uC54A\uC544 \uACF5\uC720\uD560 \uC218 \uC5C6\uC5B4\uC694.',
  },
}));

jest.mock('@/features/compose-movie', () => ({
  useRenderSource: () => ({ uri: undefined, resolving: false }),
}));

jest.mock('@/shared/ui/tab-bar-chrome', () => ({
  useSetTabBarHidden: () => mockSetTabBarHidden,
}));

// The real tile draws video frames; the page only needs its press contract.
jest.mock('@/widgets/movie-shelf', () => ({
  useMovieSummaries: () => mockMovies,
  MovieTile: ({
    movie,
    selected,
    onPress,
    onLongPress,
  }: {
    movie: MovieSummary;
    selected?: boolean;
    onPress: (movieId: string) => void;
    onLongPress?: (movie: MovieSummary) => void;
  }) => {
    const { Pressable: MockPressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <MockPressable
        accessibilityRole="button"
        accessibilityLabel={movie.title}
        accessibilityState={{ selected: selected === true }}
        onPress={() => onPress(movie.id)}
        onLongPress={() => onLongPress?.(movie)}
      />
    );
  },
}));

function makeSummary(overrides: Partial<MovieSummary> = {}): MovieSummary {
  return {
    id: 'm1',
    title: '\uBB34\uBE44 \uCCAB\uC9F8', // 무비 첫째
    status: 'ready',
    style: 'daily',
    snapCount: 3,
    totalSec: 12,
    dateLabel: '\uC624\uB298', // 오늘
    coverUris: [],
    ...overrides,
  };
}

const firstTitle = '\uBB34\uBE44 \uCCAB\uC9F8'; // 무비 첫째
const secondTitle = '\uBB34\uBE44 \uB458\uC9F8'; // 무비 둘째
const selectLabel = '\uBB34\uBE44 \uC120\uD0DD'; // 무비 선택
const cancelLabel = '\uC120\uD0DD \uCDE8\uC18C'; // 선택 취소
const emptyActionLabel = '\uC2A4\uB0C5 \uACE8\uB77C\uC11C \uC0C8 \uBB34\uBE44 \uB9CC\uB4E4\uAE30'; // 스냅 골라서 새 무비 만들기

describe('MoviesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMovies = [makeSummary(), makeSummary({ id: 'm2', title: secondTitle })];
  });

  // An empty library is where a user most needs the way to fill it; the tab
  // has no other entrance of its own.
  it('offers the snap picker when there are no movies', async () => {
    mockMovies = [];
    await render(<MoviesPage />);

    await fireEvent.press(screen.getByRole('button', { name: emptyActionLabel }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/snaps', params: { select: '1' } });
  });

  it('opens a movie on tap while not selecting', async () => {
    await render(<MoviesPage />);

    await fireEvent.press(screen.getByRole('button', { name: firstTitle }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/movie/[id]', params: { id: 'm1' } });
  });

  it('enters selection mode on a long press, with that movie selected', async () => {
    await render(<MoviesPage />);

    await fireEvent(screen.getByRole('button', { name: firstTitle }), 'longPress');

    expect(screen.getByText('1\uD3B8 \uC120\uD0DD')).toBeTruthy(); // 1편 선택
    expect(screen.getByRole('button', { name: firstTitle })).toBeSelected();
    expect(mockSetTabBarHidden).toHaveBeenCalledWith(true);
  });

  it('toggles a movie with taps while selecting', async () => {
    await render(<MoviesPage />);

    await fireEvent(screen.getByRole('button', { name: firstTitle }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: secondTitle }));
    expect(screen.getByText('2\uD3B8 \uC120\uD0DD')).toBeTruthy(); // 2편 선택
    expect(mockPush).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: secondTitle }));
    expect(screen.getByText('1\uD3B8 \uC120\uD0DD')).toBeTruthy(); // 1편 선택
  });

  it('enters and leaves selection mode through the header button', async () => {
    await render(<MoviesPage />);

    await fireEvent.press(screen.getByRole('button', { name: selectLabel }));
    expect(screen.getByText('0\uD3B8 \uC120\uD0DD')).toBeTruthy(); // 0편 선택

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    expect(screen.queryByText('0\uD3B8 \uC120\uD0DD')).toBeNull();
  });

  it('deletes the selection only after the sheet confirms', async () => {
    await render(<MoviesPage />);

    await fireEvent(screen.getByRole('button', { name: firstTitle }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: secondTitle }));

    // 2편 무비 삭제
    await fireEvent.press(
      screen.getByRole('button', { name: '2\uD3B8 \uBB34\uBE44 \uC0AD\uC81C' }),
    );
    expect(mockDeleteMovie).not.toHaveBeenCalled();

    // 무비 2편을 지울까요? → 2편 삭제
    expect(
      await screen.findByText('\uBB34\uBE44 2\uD3B8\uC744 \uC9C0\uC6B8\uAE4C\uC694?'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '2\uD3B8 \uC0AD\uC81C' }));

    expect(mockDeleteMovie).toHaveBeenCalledWith('m1');
    expect(mockDeleteMovie).toHaveBeenCalledWith('m2');
    // Confirming leaves selection mode behind.
    expect(screen.queryByText('2\uD3B8 \uC120\uD0DD')).toBeNull(); // 2편 선택
  });

  it('never offers rename in the bar, and disables share with no rendered file', async () => {
    await render(<MoviesPage />);

    await fireEvent(screen.getByRole('button', { name: firstTitle }), 'longPress');

    // Renaming belongs to the movie screen, not the grid's selection bar.
    expect(screen.queryByRole('button', { name: '\uC774\uB984 \uBC14\uAFB8\uAE30' })).toBeNull(); // 이름 바꾸기
    // Share stays on display and states its reason instead of disappearing.
    expect(screen.getByRole('button', { name: '\uACF5\uC720' })).toBeDisabled(); // 공유
  });
});
