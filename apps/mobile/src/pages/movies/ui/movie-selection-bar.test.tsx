import { fireEvent, render, screen } from '@testing-library/react-native';

import { MovieSelectionBar } from './movie-selection-bar';

// The bar reads safe-area insets — a native answer a test has no provider for.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const shareLabel = '\uACF5\uC720'; // 공유
const clearLabel = '\uC120\uD0DD \uD574\uC81C'; // 선택 해제

function makeBar(overrides: Partial<Parameters<typeof MovieSelectionBar>[0]> = {}) {
  const handlers = {
    onShare: jest.fn(),
    onDelete: jest.fn(),
    onClear: jest.fn(),
  };
  const props = {
    selectedCount: 1,
    shareBlock: 'no-render' as const,
    shareBusy: false,
    ...handlers,
    ...overrides,
  };
  return { handlers, ui: <MovieSelectionBar {...props} /> };
}

describe('MovieSelectionBar', () => {
  it('offers share only while exactly one movie is selected', async () => {
    const { rerender } = await render(makeBar({ selectedCount: 2, shareBlock: undefined }).ui);
    expect(screen.queryByRole('button', { name: shareLabel })).toBeNull();

    const shareable = makeBar({ selectedCount: 1, shareBlock: undefined });
    await rerender(shareable.ui);
    await fireEvent.press(screen.getByRole('button', { name: shareLabel }));
    expect(shareable.handlers.onShare).toHaveBeenCalled();
  });

  // A movie with no rendered file keeps the control and says why it is off:
  // taking it away leaves two identical-looking tiles and no explanation.
  it('keeps share visible but disabled while the movie has no file', async () => {
    const { handlers, ui } = makeBar({ selectedCount: 1, shareBlock: 'no-render' });
    await render(ui);

    const share = screen.getByRole('button', { name: shareLabel });
    expect(share).toBeDisabled();
    await fireEvent.press(share);
    expect(handlers.onShare).not.toHaveBeenCalled();
    // 아직 완성 파일이 만들어지지 않아 공유할 수 없어요.
    expect(
      screen.getByText(
        '\uC544\uC9C1 \uC644\uC131 \uD30C\uC77C\uC774 \uB9CC\uB4E4\uC5B4\uC9C0\uC9C0 \uC54A\uC544 \uACF5\uC720\uD560 \uC218 \uC5C6\uC5B4\uC694.',
      ),
    ).toBeTruthy();
  });

  it('deletes and clears the selection through its own buttons', async () => {
    const { handlers, ui } = makeBar({ selectedCount: 3 });
    await render(ui);

    // 3편 무비 삭제
    await fireEvent.press(
      screen.getByRole('button', { name: '3\uD3B8 \uBB34\uBE44 \uC0AD\uC81C' }),
    );
    expect(handlers.onDelete).toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: clearLabel }));
    expect(handlers.onClear).toHaveBeenCalled();
  });

  it('disables delete and clear while nothing is selected', async () => {
    const { handlers, ui } = makeBar({ selectedCount: 0 });
    await render(ui);

    // 0편 무비 삭제
    const deleteButton = screen.getByLabelText('0\uD3B8 \uBB34\uBE44 \uC0AD\uC81C');
    expect(deleteButton).toBeDisabled();
    await fireEvent.press(deleteButton);
    expect(handlers.onDelete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText(clearLabel));
    expect(handlers.onClear).not.toHaveBeenCalled();
  });
});
