import { fireEvent, render, screen } from '@testing-library/react-native';

import { OpenGeneratingMovieLabel, RefusalNotice } from './refusal-notice';

// 다른 무비를 만드는 중이에요. 다 만들어지거나 취소하면 만들 수 있어요.
const busyLine =
  '\uB2E4\uB978 \uBB34\uBE44\uB97C \uB9CC\uB4DC\uB294 \uC911\uC774\uC5D0\uC694. \uB2E4 \uB9CC\uB4E4\uC5B4\uC9C0\uAC70\uB098 \uCDE8\uC18C\uD558\uBA74 \uB9CC\uB4E4 \uC218 \uC788\uC5B4\uC694.';
// 만드는 중인 무비 보기
const openRunningLabel = '\uB9CC\uB4DC\uB294 \uC911\uC778 \uBB34\uBE44 \uBCF4\uAE30';

describe('RefusalNotice', () => {
  it('offers the busy refusal\u2019s way to the running movie as a button', async () => {
    const onPress = jest.fn();
    await render(
      <RefusalNotice message={busyLine} action={{ label: OpenGeneratingMovieLabel, onPress }} />,
    );

    expect(screen.getByText(busyLine)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: openRunningLabel }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to press when the refusal has no way out of its own', async () => {
    await render(<RefusalNotice message={busyLine} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
