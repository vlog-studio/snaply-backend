import { ApiError } from '@/shared/api';

import { cancelEditJob } from './cancel-edit-job';

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

describe('cancelEditJob', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the job it was asked to cancel', async () => {
    mockApiRequest.mockResolvedValueOnce({ canceled: true });
    await cancelEditJob('job-1');
    expect(mockApiRequest.mock.calls[0][0]).toBe('/edit-jobs/job-1');
    expect(mockApiRequest.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  // The caller tells a finished run (409) from an unknown job (404) by status;
  // the refusal must reach it as the real error, not be swallowed here.
  it('lets the server refusal through for the caller to interpret', async () => {
    const conflict = new ApiError('CONFLICT', 'already done', { status: 409 });
    mockApiRequest.mockRejectedValueOnce(conflict);
    await expect(cancelEditJob('job-1')).rejects.toBe(conflict);
  });
});
