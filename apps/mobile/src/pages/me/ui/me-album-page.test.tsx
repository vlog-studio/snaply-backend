import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { MeAlbumPage } from './me-album-page';

const mockSetEnabled = jest.fn();
let mockAutoSave = { enabled: false, blocked: false };

jest.mock('@/features/save-snap-to-album', () => ({
  useAlbumAutoSave: () => ({ ...mockAutoSave, setEnabled: mockSetEnabled }),
}));

const switchLabel = '\uCC0D\uC740 \uC2A4\uB0C5\uC744 \uC568\uBC94\uC5D0\uB3C4 \uC800\uC7A5'; // 찍은 스냅을 앨범에도 저장
const openSettings = '\uC124\uC815\uC5D0\uC11C \uAD8C\uD55C \uCF1C\uAE30'; // 설정에서 권한 켜기

describe('MeAlbumPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoSave = { enabled: false, blocked: false };
  });

  it('turns the automatic copy on from its switch', async () => {
    await render(<MeAlbumPage />);

    fireEvent(screen.getByLabelText(switchLabel), 'valueChange', true);

    expect(mockSetEnabled).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: openSettings })).toBeNull();
  });

  it('says the copies stopped and offers the OS settings when the device refuses', async () => {
    mockAutoSave = { enabled: true, blocked: true };
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await render(<MeAlbumPage />);

    expect(
      screen.getByText(
        '\uAE30\uAE30 \uC124\uC815\uC5D0\uC11C \uC0AC\uC9C4 \uCD94\uAC00\uB97C \uD5C8\uC6A9\uD574\uC57C \uC800\uC7A5\uB3FC\uC694.',
      ),
    ).toBeTruthy(); // 기기 설정에서 사진 추가를 허용해야 저장돼요.
    fireEvent.press(screen.getByRole('button', { name: openSettings }));

    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
  });
});
