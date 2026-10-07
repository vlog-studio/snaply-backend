import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { Toast } from './toast';

const message = '스냅 2개를 삭제했어요'; // 스냅 2개를 삭제했어요
const undoLabel = '되돌리기'; // 되돌리기

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Toast', () => {
  it('offers its action and goes away by itself', async () => {
    const onDismiss = jest.fn();
    const onPress = jest.fn();
    await render(
      <Toast
        message={message}
        action={{ label: undoLabel, onPress }}
        onDismiss={onDismiss}
        bottomOffset={0}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: undoLabel }));
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(5999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows nothing without a message', async () => {
    await render(<Toast message={undefined} onDismiss={jest.fn()} bottomOffset={0} />);

    expect(screen.queryByText(message)).toBeNull();
  });
});
