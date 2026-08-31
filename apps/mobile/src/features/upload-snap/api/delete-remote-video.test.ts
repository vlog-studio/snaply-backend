import { ApiError } from '@/shared/api';

import { deleteRemoteVideo } from './delete-remote-video';

jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false }));

const mockApiRequest = jest.fn();
jest.mock('@/shared/api', () => {
  const actual = jest.requireActual('@/shared/api/api-error');
  return {
    ApiError: actual.ApiError,
    apiRequest: (...args: unknown[]) => mockApiRequest(...args),
    apiPath: (path: string, params: Record<string, string>) =>
      path.replace(/\{([^}]+)\}/g, (_, name: string) => params[name]),
  };
});

describe('deleteRemoteVideo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the video it was asked to delete', async () => {
    mockApiRequest.mockResolvedValueOnce({ deleted: true });

    await deleteRemoteVideo('video-1');

    expect(mockApiRequest.mock.calls[0][0]).toBe('/videos/video-1');
    expect(mockApiRequest.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  // The regression this guards: a 404 reported as a failure kept the caller's
  // tombstone owed forever, so a videoId the backend no longer has was deleted
  // again at every app launch.
  it('treats a video the backend does not have as already deleted', async () => {
    mockApiRequest.mockRejectedValueOnce(
      new ApiError('NOT_FOUND', '영상을 찾을 수 없습니다.', {
        status: 404,
      }),
    );

    await expect(deleteRemoteVideo('video-gone')).resolves.toBeUndefined();
  });

  it('rejects on a failure that could still succeed later', async () => {
    const offline = new ApiError('network_error', '네트워크 요청에 실패했습니다.');
    mockApiRequest.mockRejectedValueOnce(offline);

    await expect(deleteRemoteVideo('video-1')).rejects.toBe(offline);
  });
});
