import { getEditJob } from './get-edit-job';

jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false }));

const mockApiRequest = jest.fn();
jest.mock('@/shared/api', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  apiPath: (path: string, params: Record<string, string>) =>
    path.replace(/\{([^}]+)\}/g, (_, name: string) => params[name]),
}));

/** A server response with the fields the app reads, overridable per case. */
function respondWith(dto: Record<string, unknown>) {
  mockApiRequest.mockImplementationOnce(
    (_path: string, options: { schema: { parse: (v: unknown) => unknown } }) =>
      Promise.resolve(
        options.schema.parse({
          status: 'processing',
          progress: 40,
          videoId: 'result-1',
          errorMessage: null,
          ...dto,
        }),
      ),
  );
}

describe('getEditJob', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks about the job it was given', async () => {
    respondWith({});
    await getEditJob('job-1');
    expect(mockApiRequest.mock.calls[0][0]).toBe('/edit-jobs/job-1');
  });

  it.each(['queued', 'processing', 'done', 'failed', 'canceled'])(
    'keeps the known status %s',
    async (status) => {
      respondWith({ status });
      await expect(getEditJob('job-1')).resolves.toMatchObject({ status });
    },
  );

  // "Keep waiting" is the only answer that cannot lose a result: `failed` would
  // throw one away and `done` would claim a file that may not exist.
  it('reads an unknown status as still running', async () => {
    respondWith({ status: 'paused' });
    await expect(getEditJob('job-1')).resolves.toMatchObject({ status: 'processing' });
  });

  it.each([
    [-5, 0],
    [40.6, 41],
    [180, 100],
  ])('clamps progress %s to %s', async (given, expected) => {
    respondWith({ progress: given });
    await expect(getEditJob('job-1')).resolves.toMatchObject({ progress: expected });
  });

  // The job's videoId is the *result* row, which is what the finished movie's
  // file is fetched from.
  it('reports the result video id', async () => {
    respondWith({ videoId: 'result-9' });
    await expect(getEditJob('job-1')).resolves.toMatchObject({ videoId: 'result-9' });
  });

  it('carries a failure reason when there is one', async () => {
    const reason = '\uD3B8\uC9D1 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'; // 편집 시간이 초과되었습니다.
    respondWith({ status: 'failed', errorMessage: reason });
    await expect(getEditJob('job-1')).resolves.toMatchObject({ errorMessage: reason });
  });

  it('omits the reason when the server sent none', async () => {
    respondWith({ errorMessage: null });
    await expect(getEditJob('job-1')).resolves.not.toHaveProperty('errorMessage');
  });

  // The classification code is what the app words the failure from; it must
  // arrive even when this build has never heard of the value (append-only).
  it.each(['TIMEOUT', 'NEXT_YEARS_CODE'])('carries the failure code %s', async (errorCode) => {
    respondWith({ status: 'failed', errorCode });
    await expect(getEditJob('job-1')).resolves.toMatchObject({ errorCode });
  });

  it('omits the failure code when the server sent none', async () => {
    respondWith({ errorCode: null });
    await expect(getEditJob('job-1')).resolves.not.toHaveProperty('errorCode');
  });
});
