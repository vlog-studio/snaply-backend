import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { BackBar } from './back-bar';

/** The bar pads itself by the status bar, so it needs metrics to render at all. */
const ScreenMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderInSafeArea = (element: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={ScreenMetrics}>{element}</SafeAreaProvider>);

describe('BackBar', () => {
  it('exposes a button under the default back label and calls onPress', async () => {
    const defaultLabel = '뒤로 가기'; // 뒤로 가기
    const onPress = jest.fn();
    await renderInSafeArea(<BackBar onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: defaultLabel }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('names the button with the given label', async () => {
    const label = '템플릿 닫기'; // 템플릿 닫기
    await renderInSafeArea(<BackBar accessibilityLabel={label} onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  });

  it('shows the title as a header when the screen names itself on the bar', async () => {
    const title = '동네 산책'; // 동네 산책
    await renderInSafeArea(<BackBar title={title} onPress={jest.fn()} />);

    expect(screen.getByRole('header', { name: title })).toBeTruthy();
  });

  it('stays bare without a title or an action', async () => {
    await renderInSafeArea(<BackBar onPress={jest.fn()} />);

    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('calls the action rather than going back when the trailing button is pressed', async () => {
    const actionLabel = '무비 이름 바꾸기'; // 무비 이름 바꾸기
    const onPress = jest.fn();
    const onAction = jest.fn();
    await renderInSafeArea(
      <BackBar
        title="동네 산책" // 동네 산책
        action={{ icon: 'pencil', label: actionLabel, onPress: onAction }}
        onPress={onPress}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: actionLabel }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
