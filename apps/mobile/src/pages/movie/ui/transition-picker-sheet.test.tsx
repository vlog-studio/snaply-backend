import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TransitionPickerSheet } from './transition-picker-sheet';

const aiCrossfade = {
  kind: 'crossfade' as const,
  durationMs: 800,
  owner: 'ai' as const,
  toSnapId: 's2',
};

// The sheet reads the safe area; seed fixed metrics so it resolves in tests.
const SafeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderSheet(props: Partial<Parameters<typeof TransitionPickerSheet>[0]> = {}) {
  const onPick = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SafeAreaMetrics}>
      <TransitionPickerSheet
        visible
        index={0}
        current={aiCrossfade}
        playedKind="crossfade"
        canEdit
        onPick={onPick}
        onClose={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return onPick;
}

describe('TransitionPickerSheet', () => {
  it('hands a pick and "\uC790\uB3D9\uC73C\uB85C \uACE0\uB974\uAE30" back as the kind and as undefined', async () => {
    const onPick = await renderSheet();

    // fireEvent.press(screen.getByLabelText('번쩍 넘기기'));
    fireEvent.press(screen.getByLabelText('\uBC88\uCA4D \uB118\uAE30\uAE30'));
    // fireEvent.press(screen.getByLabelText('자동으로 고르기 · 지금 겹쳐 녹이기'));
    fireEvent.press(
      screen.getByLabelText(
        '\uC790\uB3D9\uC73C\uB85C \uACE0\uB974\uAE30 \u00B7 \uC9C0\uAE08 \uACB9\uCCD0 \uB179\uC774\uAE30',
      ),
    );

    expect(onPick.mock.calls).toEqual([['flash'], [undefined]]);
  });
});
