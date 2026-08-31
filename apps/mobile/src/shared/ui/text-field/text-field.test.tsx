import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextField } from './text-field';

describe('TextField', () => {
  it('renders the label and forwards typed text', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="이메일" value="" onChangeText={onChangeText} />);

    expect(screen.getByText('이메일')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('이메일'), 'a@b.com');
    expect(onChangeText).toHaveBeenCalledWith('a@b.com');
  });
});
