import { fireEvent, render, screen } from '@testing-library/react-native';

import { SnaplyButton } from './snaply-button';

describe('SnaplyButton', () => {
  const buttonTitle = '\uCD2C\uC601 \uC2DC\uC791';

  it('calls onPress when the user presses the button', async () => {
    const onPress = jest.fn();
    await render(<SnaplyButton title={buttonTitle} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: buttonTitle }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<SnaplyButton disabled title={buttonTitle} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: buttonTitle }));

    expect(onPress).not.toHaveBeenCalled();
  });
});
