import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { CancellationOutcome } from '@/features/compose-movie';

import { CancelRunControl } from './cancel-run-control';

// 만들기 취소
const cancelLabel = '만들기 취소';
// 계속 만들기
const keepLabel = '계속 만들기';
// 서버에 연결하지 못했어요 (the unreachable line's head)
const unreachableHead = '서버에 연결하지 못했어요';

function renderControl(cancel: () => Promise<CancellationOutcome>) {
  return render(<CancelRunControl cancel={cancel} />);
}

describe('CancelRunControl', () => {
  it('confirms before canceling — the first tap asks, it does not act', async () => {
    const cancel = jest.fn();
    await renderControl(cancel);

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));

    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: keepLabel })).toBeOnTheScreen();
  });

  it('backs out of the confirm without canceling', async () => {
    const cancel = jest.fn();
    await renderControl(cancel);

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    await fireEvent.press(screen.getByRole('button', { name: keepLabel }));

    expect(cancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: keepLabel })).toBeNull();
  });

  it('cancels on the confirming tap', async () => {
    const cancel = jest.fn().mockResolvedValue({ canceled: true });
    await renderControl(cancel);

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    });

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  // The run is still going; the control has to say so and offer the same act
  // again rather than pretending something changed.
  it('says the server could not be reached and stays askable', async () => {
    const cancel = jest.fn().mockResolvedValue({ canceled: false, refused: 'unreachable' });
    await renderControl(cancel);

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    });

    expect(screen.getByText(new RegExp(unreachableHead))).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: cancelLabel }).props.accessibilityState.disabled,
    ).toBe(false);
  });

  // The run ended while the request was in flight — the runner is delivering
  // the result, and a message here would race the status change it describes.
  it('resets quietly when the run settled first', async () => {
    const cancel = jest.fn().mockResolvedValue({ canceled: false, refused: 'settled' });
    await renderControl(cancel);

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: cancelLabel }));
    });

    expect(screen.queryByRole('button', { name: keepLabel })).toBeNull();
    expect(screen.getByRole('button', { name: cancelLabel })).toBeOnTheScreen();
  });
});
