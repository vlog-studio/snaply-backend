import { z } from 'zod';

import { ApiError } from './api-error';
import { apiRequest } from './client';
import { subscribeToApiErrors } from './error-listeners';
import { apiPath } from './paths';

const mockAuthHeader = jest.fn<Promise<Record<string, string>>, []>();

jest.mock('@/shared/config/api', () => ({
  API_BASE_URL: 'https://api.example.test/root/',
}));

jest.mock('./auth-header', () => ({
  authHeader: () => mockAuthHeader(),
}));

/**
 * Compile-time contract of `apiRequest`'s typing, derived from the shared Zod
 * contract (`@vlog-studio/shared-types`). None of these thunks is ever called —
 * `npm run typecheck` is the real assertion, including that every
 * `@ts-expect-error` line genuinely fails to compile (tsc reports an unused
 * suppression otherwise).
 */
describe('apiRequest type contract', () => {
  const accepted: (() => unknown)[] = [
    // A schema may narrow the contract's data to the fields the app consumes.
    () =>
      apiRequest('/videos/upload-url', {
        query: { filename: 'a.mp4', contentType: 'video/mp4' },
        schema: z.object({ videoId: z.string(), uploadUrl: z.string() }),
      }),
    // z.unknown() opts out of response typing (the body still type-checks).
    () =>
      apiRequest('/videos', {
        method: 'POST',
        body: { videoId: 'video-1', durationSeconds: 3 },
        schema: z.unknown(),
      }),
    // A resolved path keeps the typing of the template it was built from.
    () =>
      apiRequest(apiPath('/videos/{id}', { id: 'video-1' }), {
        method: 'DELETE',
        schema: z.unknown(),
      }),
  ];

  const rejected: (() => unknown)[] = [
    () =>
      apiRequest('/videos/upload-url', {
        // @ts-expect-error — `filenam` is not a query parameter of this endpoint
        query: { filenam: 'a.mp4', contentType: 'video/mp4' },
        schema: z.unknown(),
      }),
    () =>
      apiRequest('/videos', {
        method: 'POST',
        // @ts-expect-error — the contract types durationSeconds as a number
        body: { videoId: 'video-1', durationSeconds: '3' },
        schema: z.unknown(),
      }),
    () =>
      apiRequest('/videos/upload-url', {
        query: { filename: 'a.mp4', contentType: 'video/mp4' },
        // @ts-expect-error — GET /videos/upload-url takes no request body
        body: { anything: true },
        schema: z.unknown(),
      }),
    () =>
      apiRequest('/locations', {
        // @ts-expect-error — the contract defines no POST /locations
        method: 'POST',
        schema: z.unknown(),
      }),
    () =>
      apiRequest('/videos/upload-url', {
        query: { filename: 'a.mp4', contentType: 'video/mp4' },
        // @ts-expect-error — the contract's data carries no `downloadUrl` field
        schema: z.object({ downloadUrl: z.string() }),
      }),
    // @ts-expect-error — POST-only endpoint: omitting `method` would GET it
    () => apiRequest('/edit-jobs', { schema: z.unknown() }),
  ];

  void accepted;
  void rejected;
});

function responseWith(payload: unknown, status = 200): Response {
  return {
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('apiRequest runtime contract', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
    mockAuthHeader.mockReset();
    mockAuthHeader.mockResolvedValue({ Authorization: 'Bearer token-1' });
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it('sends query, authentication, and cancellation to the configured backend', async () => {
    const controller = new AbortController();
    fetchSpy.mockResolvedValue(
      responseWith({
        success: true,
        data: { videoId: 'video-1', uploadUrl: 'https://upload.test/1', ignored: true },
      }),
    );

    const result = await apiRequest('/videos/upload-url', {
      query: { filename: 'a b.mp4', contentType: 'video/mp4' },
      schema: z.object({ videoId: z.string(), uploadUrl: z.string() }),
      signal: controller.signal,
    });

    expect(result).toEqual({ videoId: 'video-1', uploadUrl: 'https://upload.test/1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.test/root/videos/upload-url?filename=a+b.mp4&contentType=video%2Fmp4',
      {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token-1',
        },
        body: undefined,
      },
    );
  });

  it('serializes a JSON body and does not invent authentication when signed out', async () => {
    mockAuthHeader.mockResolvedValue({});
    fetchSpy.mockResolvedValue(responseWith({ success: true, data: null }, 201));

    await apiRequest('/videos', {
      method: 'POST',
      body: { videoId: 'video-1', durationSeconds: 3 },
      schema: z.unknown(),
    });

    expect(fetchSpy).toHaveBeenCalledWith('https://api.example.test/root/videos', {
      method: 'POST',
      signal: undefined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ videoId: 'video-1', durationSeconds: 3 }),
    });
  });

  it('omits nullish query values without dropping false or zero', async () => {
    fetchSpy.mockResolvedValue(responseWith({ success: true, data: [] }));

    await apiRequest('/locations', {
      query: { lat: 0, lng: 127, radius: undefined },
      schema: z.array(z.unknown()),
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.test/root/locations?lat=0&lng=127',
      expect.any(Object),
    );
  });

  it('normalizes a transport failure and preserves its cause', async () => {
    const cause = new Error('offline');
    fetchSpy.mockRejectedValue(cause);

    const request = apiRequest('/locations', {
      query: { lat: 37, lng: 127 },
      schema: z.array(z.unknown()),
    });

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      code: 'network_error',
      cause,
    });
  });

  it('rejects a response whose body is not JSON with the HTTP status attached', async () => {
    fetchSpy.mockResolvedValue({
      status: 502,
      json: jest.fn().mockRejectedValue(new SyntaxError('not json')),
    } as unknown as Response);

    const request = apiRequest('/locations', {
      query: { lat: 37, lng: 127 },
      schema: z.array(z.unknown()),
    });

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      code: 'malformed_response',
      status: 502,
    });
  });

  it('rejects a JSON body that is not the shared response envelope', async () => {
    fetchSpy.mockResolvedValue(responseWith({ locations: [] }, 200));

    const request = apiRequest('/locations', {
      query: { lat: 37, lng: 127 },
      schema: z.array(z.unknown()),
    });

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      code: 'malformed_response',
      status: 200,
    });
  });

  it('carries a field the error object added next to code and message', async () => {
    fetchSpy.mockResolvedValue(
      responseWith(
        {
          success: false,
          error: {
            code: 'ACCOUNT_PENDING_DELETION',
            message: '삭제 대기 중인 계정입니다.',
            purgeAfter: '2026-09-11T08:00:00.000Z',
          },
        },
        403,
      ),
    );

    const request = apiRequest('/locations', {
      query: { lat: 37, lng: 127 },
      schema: z.array(z.unknown()),
    });

    await expect(request).rejects.toMatchObject({
      code: 'ACCOUNT_PENDING_DELETION',
      details: { purgeAfter: '2026-09-11T08:00:00.000Z' },
    });
  });

  it('carries the backend error contract through to callers', async () => {
    fetchSpy.mockResolvedValue(
      responseWith(
        {
          success: false,
          error: { code: 'plan_limit', message: 'Monthly limit reached' },
        },
        403,
      ),
    );

    const request = apiRequest('/locations', {
      query: { lat: 37, lng: 127 },
      schema: z.array(z.unknown()),
    });

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      code: 'plan_limit',
      message: 'Monthly limit reached',
      status: 403,
    });
  });

  it('lets the response schema reject invalid success data', async () => {
    fetchSpy.mockResolvedValue(
      responseWith({ success: true, data: { videoId: 1, uploadUrl: 'https://upload.test/1' } }),
    );

    const request = apiRequest('/videos/upload-url', {
      query: { filename: 'a.mp4', contentType: 'video/mp4' },
      schema: z.object({ videoId: z.string(), uploadUrl: z.string() }),
    });

    await expect(request).rejects.toBeInstanceOf(z.ZodError);
  });

  it('announces every ApiError to subscribers and stops after unsubscribe', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToApiErrors(listener);
    fetchSpy.mockResolvedValue(
      responseWith(
        { success: false, error: { code: 'ACCOUNT_PENDING_DELETION', message: '삭제 대기' } },
        403,
      ),
    );

    await expect(
      apiRequest('/locations', { query: { lat: 37, lng: 127 }, schema: z.array(z.unknown()) }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_PENDING_DELETION', status: 403 }),
    );

    unsubscribe();
    await expect(
      apiRequest('/locations', { query: { lat: 37, lng: 127 }, schema: z.array(z.unknown()) }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
