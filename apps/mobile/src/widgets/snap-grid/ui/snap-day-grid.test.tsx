import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Snap } from '@/entities/snap';

import type { SnapDay } from '../model/use-snap-days';
import { SnapDayGrid } from './snap-day-grid';

// The cell's frame pulls a thumbnail off the file system through a native
// module — the one boundary a grid test has no answer for.
jest.mock('@/shared/ui/video-frame', () => ({ VideoFrame: () => null }));

// 동영상에서 스냅 가져오기
const importLabel = '\uB3D9\uC601\uC0C1\uC5D0\uC11C \uC2A4\uB0C5 \uAC00\uC838\uC624\uAE30';

function makeSnap(id: string): Snap {
  return {
    id,
    uri: `file:///${id}.mp4`,
    durationSec: 3,
    capturedAt: 1_770_000_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
}

const oneDay: SnapDay[] = [
  { key: '2026-02-02', label: '\uC624\uB298', snaps: [makeSnap('a')] }, // 오늘
];

function renderGrid(days: SnapDay[], onImport?: () => void, selecting = false) {
  return render(
    <SnapDayGrid
      days={days}
      selecting={selecting}
      picked={[]}
      heldIds={new Set()}
      onPress={jest.fn()}
      onImport={onImport}
    />,
  );
}

describe('SnapDayGrid', () => {
  it('offers the import cell only when the screen owns importing', async () => {
    await renderGrid(oneDay);
    expect(screen.queryByRole('button', { name: importLabel })).toBeNull();

    const onImport = jest.fn();
    await renderGrid(oneDay, onImport);
    await fireEvent.press(screen.getByRole('button', { name: importLabel }));
    expect(onImport).toHaveBeenCalled();
  });

  it('keeps the import cell while selecting, disabled, so the grid never shifts', async () => {
    const onImport = jest.fn();
    await renderGrid(oneDay, onImport, true);

    const cell = screen.getByRole('button', { name: importLabel });
    expect(cell).toBeDisabled();
    await fireEvent.press(cell);
    expect(onImport).not.toHaveBeenCalled();
  });

  it('keeps the import cell on an empty library, which has no day section to lead', async () => {
    const onImport = jest.fn();
    await renderGrid([], onImport);

    await fireEvent.press(screen.getByRole('button', { name: importLabel }));
    expect(onImport).toHaveBeenCalled();
  });
});
