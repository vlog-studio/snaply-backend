import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomSheet } from './bottom-sheet';

// useSafeAreaInsets needs a provider; seed fixed metrics so insets resolve
// synchronously in tests.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withSafeArea(node: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

describe('BottomSheet', () => {
  it('calls onClose when the backdrop is pressed', async () => {
    const onClose = jest.fn();
    await render(
      withSafeArea(
        <BottomSheet visible onClose={onClose}>
          <Text>내용</Text>
        </BottomSheet>,
      ),
    );

    fireEvent.press(screen.getByRole('button', { name: '닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The deferred unmount (the Modal staying up until the close animation
  // finishes) is not asserted here: Jest never delivers a layout pass, so the
  // panel is never measured, the slide never starts, and the close resolves on
  // the same tick. Verify the enter/exit motion on device instead.
});
