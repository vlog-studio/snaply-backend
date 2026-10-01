import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SnapSelectionBar } from './snap-selection-bar';

const ConfirmLabel = '자동으로 편집하기'; // 자동으로 편집하기
const ClearLabel = '선택 해제'; // 선택 해제
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const DeleteLabel = '2개 스냅 삭제'; // 2개 스냅 삭제

async function renderBar(props: { busy?: boolean; confirmDisabled?: boolean }) {
  const handlers = { onConfirm: jest.fn(), onClear: jest.fn(), onDelete: jest.fn() };
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SnapSelectionBar
        selectedCount={2}
        heldCount={0}
        capacity={30}
        targetLabel={'자동 편집'}
        confirmLabel={ConfirmLabel}
        {...handlers}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return handlers;
}

describe('SnapSelectionBar', () => {
  it('takes no second confirm, and keeps the picks, while the target is answering', async () => {
    const handlers = await renderBar({ busy: true });

    // Announced as working, not as refused.
    const confirm = screen.getByRole('button', { name: ConfirmLabel, busy: true, disabled: true });
    fireEvent.press(confirm);
    fireEvent.press(screen.getByRole('button', { name: ClearLabel }));
    fireEvent.press(screen.getByRole('button', { name: DeleteLabel }));

    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onClear).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('refuses only the confirm when the target cannot take the picks', async () => {
    const handlers = await renderBar({ confirmDisabled: true });

    fireEvent.press(screen.getByRole('button', { name: ConfirmLabel }));
    fireEvent.press(screen.getByRole('button', { name: ClearLabel }));

    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onClear).toHaveBeenCalled();
  });
});
