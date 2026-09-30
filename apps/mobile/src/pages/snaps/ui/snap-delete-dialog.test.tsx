import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SnapDeleteDialog, type SnapDeleteDialogProps } from './snap-delete-dialog';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withSafeArea(node: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

const impact = [
  { movieId: 'm1', title: '\uC81C\uC8FC \uC5EC\uD589', cutCount: 6, nextCutCount: 5 },
];

function renderDialog(overrides: Partial<SnapDeleteDialogProps> = {}) {
  const props: SnapDeleteDialogProps = {
    visible: true,
    count: 1,
    impact: [],
    isDeleting: false,
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
    ...overrides,
  };
  return render(withSafeArea(<SnapDeleteDialog {...props} />)).then(() => props);
}

describe('SnapDeleteDialog', () => {
  it('asks nothing about where when no pick is kept on the server', async () => {
    const props = await renderDialog({ count: 2 });

    expect(
      screen.queryByRole('button', {
        name: new RegExp('\uC774 \uAE30\uAE30\uC5D0\uC11C\uB9CC \uC0AD\uC81C'),
      }),
    ).toBeNull(); // 이 기기에서만 삭제
    fireEvent.press(screen.getByRole('button', { name: '\uC2A4\uB0C5 2\uAC1C \uC0AD\uC81C' })); // 스냅 2개 삭제

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('offers deleting from this device only, and says until when the snap stays viewable', async () => {
    const keptUntil = new Date(2026, 9, 14).getTime();
    const props = await renderDialog({
      deviceOnly: { count: 1, keptUntil },
      onConfirmDeviceOnly: jest.fn(),
    });

    expect(
      screen.getByText(
        '2026\uB144 10\uC6D4 14\uC77C\uAE4C\uC9C0\uB294 \uACC4\uC18D \uBCFC \uC218 \uC788\uC5B4\uC694.',
      ),
    ).toBeTruthy(); // 2026년 10월 14일까지는 계속 볼 수 있어요.
    fireEvent.press(
      screen.getByRole('button', {
        name: '\uC2A4\uB0C5 1\uAC1C \uC774 \uAE30\uAE30\uC5D0\uC11C\uB9CC \uC0AD\uC81C',
      }),
    ); // 스냅 1개 이 기기에서만 삭제

    expect(props.onConfirmDeviceOnly).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('keeps deleting everywhere as the other answer, with the movies it would cut', async () => {
    const props = await renderDialog({
      impact,
      deviceOnly: { count: 1 },
      onConfirmDeviceOnly: jest.fn(),
    });

    expect(screen.getByText('\uC81C\uC8FC \uC5EC\uD589')).toBeTruthy(); // 제주 여행
    fireEvent.press(
      screen.getByRole('button', {
        name: '\uC2A4\uB0C5 1\uAC1C \uBAA8\uB4E0 \uAE30\uAE30\uC5D0\uC11C \uC0AD\uC81C',
      }),
    ); // 스냅 1개 모든 기기에서 삭제

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onConfirmDeviceOnly).not.toHaveBeenCalled();
  });

  it('says how many a mixed pick deletes from this device, since the rest stay as they are', async () => {
    await renderDialog({
      count: 3,
      deviceOnly: { count: 2 },
      onConfirmDeviceOnly: jest.fn(),
    });

    expect(
      screen.getByText(
        '\uBCF4\uAD00 \uC911\uC778 2\uAC1C\uB9CC \uC9C0\uC6CC\uC694. \uBCF4\uAD00 \uAE30\uAC04\uC774 \uB05D\uB0A0 \uB54C\uAE4C\uC9C0\uB294 \uACC4\uC18D \uBCFC \uC218 \uC788\uC5B4\uC694.', // 보관 중인 2개만 지워요. 보관 기간이 끝날 때까지는 계속 볼 수 있어요.
      ),
    ).toBeTruthy();
  });

  it('holds both answers while a delete runs', async () => {
    const props = await renderDialog({
      isDeleting: true,
      deviceOnly: { count: 1 },
      onConfirmDeviceOnly: jest.fn(),
    });

    fireEvent.press(
      screen.getByRole('button', {
        name: '\uC2A4\uB0C5 1\uAC1C \uC774 \uAE30\uAE30\uC5D0\uC11C\uB9CC \uC0AD\uC81C',
      }),
    ); // 스냅 1개 이 기기에서만 삭제
    fireEvent.press(
      screen.getByRole('button', {
        name: '\uC2A4\uB0C5 1\uAC1C \uBAA8\uB4E0 \uAE30\uAE30\uC5D0\uC11C \uC0AD\uC81C',
      }),
    ); // 스냅 1개 모든 기기에서 삭제

    expect(props.onConfirmDeviceOnly).not.toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
