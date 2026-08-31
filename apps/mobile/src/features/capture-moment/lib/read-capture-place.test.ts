import { readCapturePlace } from './read-capture-place';

const mockRequestPermission = jest.fn();
const mockGetCoordinates = jest.fn();

jest.mock('@/shared/lib/location', () => ({
  requestForegroundLocationPermission: () => mockRequestPermission(),
  getCurrentCoordinates: () => mockGetCoordinates(),
}));

const place = { latitude: 37.5445, longitude: 127.0557 };

describe('readCapturePlace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockGetCoordinates.mockResolvedValue(place);
  });

  it('returns the current coordinates once permission is granted', async () => {
    await expect(readCapturePlace()).resolves.toEqual(place);
  });

  it('does not read a position when permission is refused', async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });

    await expect(readCapturePlace()).resolves.toBeUndefined();
    expect(mockGetCoordinates).not.toHaveBeenCalled();
  });

  it.each([
    ['no fix is available', () => mockGetCoordinates.mockResolvedValue(null)],
    ['the position read throws', () => mockGetCoordinates.mockRejectedValue(new Error('gps'))],
    [
      'the permission call throws',
      () => mockRequestPermission.mockRejectedValue(new Error('native')),
    ],
  ])('resolves to undefined when %s, so the capture still files', async (_case, arrange) => {
    arrange();

    await expect(readCapturePlace()).resolves.toBeUndefined();
  });

  it('gives up on a fix that never arrives rather than holding the capture', async () => {
    jest.useFakeTimers();
    mockGetCoordinates.mockReturnValue(new Promise(() => {}));

    const pending = readCapturePlace();
    // Let the permission promise settle before the timer that races the read.
    await Promise.resolve();
    await Promise.resolve();
    jest.runAllTimers();

    await expect(pending).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
