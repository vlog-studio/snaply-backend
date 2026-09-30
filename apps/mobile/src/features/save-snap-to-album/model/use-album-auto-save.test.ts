import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getAlbumPermission, requestAlbumPermission } from '@/shared/lib/media-library';

import { useAlbumAutoSaveStore } from './album-auto-save-store';
import { useAlbumAutoSave } from './use-album-auto-save';

jest.mock('@/shared/lib/media-library', () => ({
  getAlbumPermission: jest.fn(),
  requestAlbumPermission: jest.fn(),
}));

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockGetPermission = getAlbumPermission as jest.MockedFunction<typeof getAlbumPermission>;
const mockRequestPermission = requestAlbumPermission as jest.MockedFunction<
  typeof requestAlbumPermission
>;

const Granted = { granted: true, canAskAgain: true };
const Refused = { granted: false, canAskAgain: false };

describe('useAlbumAutoSave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAlbumAutoSaveStore.setState({ enabled: false });
    mockGetPermission.mockResolvedValue(Granted);
  });

  it('is off until the user turns it on', async () => {
    const { result } = await renderHook(() => useAlbumAutoSave());

    expect(result.current.enabled).toBe(false);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('turns on once the device allows adding to the album', async () => {
    mockRequestPermission.mockResolvedValue(Granted);
    const { result } = await renderHook(() => useAlbumAutoSave());

    await act(async () => result.current.setEnabled(true));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.blocked).toBe(false);
  });

  it('stays off and says so when the device refuses', async () => {
    mockRequestPermission.mockResolvedValue(Refused);
    const { result } = await renderHook(() => useAlbumAutoSave());

    await act(async () => result.current.setEnabled(true));

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.enabled).toBe(false);
  });

  it('turns off without asking anything', async () => {
    useAlbumAutoSaveStore.setState({ enabled: true });
    const { result } = await renderHook(() => useAlbumAutoSave());

    await act(async () => result.current.setEnabled(false));

    expect(result.current.enabled).toBe(false);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('notices a grant withdrawn since it was turned on, keeping the choice', async () => {
    useAlbumAutoSaveStore.setState({ enabled: true });
    mockGetPermission.mockResolvedValue(Refused);

    const { result } = await renderHook(() => useAlbumAutoSave());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.enabled).toBe(true);
  });
});
