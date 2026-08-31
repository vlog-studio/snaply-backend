import { act, renderHook } from '@testing-library/react-native';

import type { Movie } from '@/entities/movie';
import { ApiError } from '@/shared/api';

import type { EditProgressHandlers } from '../api/subscribe-edit-progress';
import { editFailureMessage } from '../lib/edit-failure-copy';

import { useGenerationRunner } from './use-generation-runner';

const mockAdvance = jest.fn();
const mockFinish = jest.fn();
const mockFail = jest.fn();
const mockCancel = jest.fn();
const mockSetThumbnail = jest.fn();
const mockDownloadThumbnail = jest.fn<Promise<string | undefined>, [string, string]>();
const mockMovies = jest.fn<Movie[], []>();
const mockSnapIndex = jest.fn<Map<string, { id: string; durationSec: number }>, []>();
const mockSnapsHydrated = jest.fn<boolean, []>();
const mockAnnounce = jest.fn();
const mockGetEditJob = jest.fn();
const mockGetEditedVideo = jest.fn();
const mockCloseSocket = jest.fn();
/** The live subscriptions, by job id, so a test can push a frame at one. */
const mockSockets = new Map<string, EditProgressHandlers>();

jest.mock('@/entities/movie', () => ({
  useMovies: () => mockMovies(),
  useAdvanceMovieJob: () => mockAdvance,
  useFinishMovieJob: () => mockFinish,
  useFailMovieJob: () => mockFail,
  useCancelMovieJob: () => mockCancel,
  useSetRenderThumbnail: () => mockSetThumbnail,
  cutsDurationSec: (refs: { snapId: string }[], lookup: (id: string) => number | undefined) =>
    refs.reduce((total, ref) => total + (lookup(ref.snapId) ?? 0), 0),
}));

jest.mock('../api/download-render-thumbnail', () => ({
  downloadRenderThumbnail: (url: string, key: string) => mockDownloadThumbnail(url, key),
}));

jest.mock('@/entities/snap', () => ({
  useSnapIndex: () => mockSnapIndex(),
  useSnapsHydrated: () => mockSnapsHydrated(),
}));

jest.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

// A stand-in for the transport error type, so the runner's `instanceof` check —
// which is how a 404 is told from a flaky network — behaves as it does in the app.
jest.mock('../api/get-edit-job', () => ({ getEditJob: (...a: unknown[]) => mockGetEditJob(...a) }));
jest.mock('../api/get-edited-video', () => ({
  getEditedVideo: (...a: unknown[]) => mockGetEditedVideo(...a),
}));
jest.mock('../api/subscribe-edit-progress', () => ({
  subscribeEditProgress: (jobId: string, handlers: EditProgressHandlers) => {
    mockSockets.set(jobId, handlers);
    return { close: () => mockCloseSocket(jobId) };
  },
}));
jest.mock('../lib/announce-job-end', () => ({
  announceJobEnd: (...args: unknown[]) => mockAnnounce(...args),
}));

const startedAt = 1_754_000_000_000;
const cutStep = '\uCEF7\uD3B8\uC9D1 \uC644\uB8CC'; // 컷편집 완료
const serverReason = '\uD3B8\uC9D1 \uC2E4\uD328'; // 편집 실패

function generatingMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'm1',
    title: '\uBB34\uBE44', // 무비
    status: 'generating',
    createdAt: startedAt,
    updatedAt: startedAt,
    snapRefs: [{ snapId: 's1', order: 0 }],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
    job: { id: 'job-1', progress: 0, startedAt },
    ...overrides,
  };
}

/** Pushes one socket frame at a running job and lets the writes settle. */
async function emit(jobId: string, event: Parameters<EditProgressHandlers['onEvent']>[0]) {
  await act(async () => {
    mockSockets.get(jobId)?.onEvent(event);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSockets.clear();
  mockMovies.mockReturnValue([]);
  mockSnapIndex.mockReturnValue(new Map([['s1', { id: 's1', durationSec: 4 }]]));
  mockSnapsHydrated.mockReturnValue(true);
  // The default answer to the catch-up pass: the run is still going.
  mockGetEditJob.mockResolvedValue({ status: 'processing', progress: 35, videoId: 'result-1' });
  mockGetEditedVideo.mockResolvedValue({});
  mockDownloadThumbnail.mockResolvedValue(undefined);
});

describe('useGenerationRunner', () => {
  it('follows every job in flight, and nothing else', async () => {
    mockMovies.mockReturnValue([
      generatingMovie(),
      generatingMovie({ id: 'm2', job: { id: 'job-2', progress: 0, startedAt } }),
      generatingMovie({ id: 'm3', status: 'draft', job: undefined }),
    ]);

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect([...mockSockets.keys()]).toEqual(['job-1', 'job-2']);
  });

  it('writes the progress and step the backend reported', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    await emit('job-1', { kind: 'progress', progress: 35, step: cutStep });

    expect(mockAdvance).toHaveBeenCalledWith('m1', 35, cutStep);
    expect(mockFinish).not.toHaveBeenCalled();
  });

  // The socket says the run is over but cannot be trusted for what it produced:
  // a reconnect to a finished job arrives without the URL at all.
  it('confirms a completion against the backend and finishes with the rendered file', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-9' });
    mockGetEditedVideo.mockResolvedValue({ editedUrl: 'https://x/e.mp4', durationSeconds: 11 });
    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    await emit('job-1', { kind: 'done', outputUrl: 'https://x/e.mp4' });

    expect(mockGetEditedVideo).toHaveBeenCalledWith('result-9');
    expect(mockFinish).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ uri: 'https://x/e.mp4', videoId: 'result-9', durationSec: 11 }),
    );
  });

  // Mock mode, and any run whose file could not be found: the movie still
  // finishes and plays its cuts, so its length is the cuts' length.
  it('finishes without a file when the run produced none, measuring the cuts', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-1' });
    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    await emit('job-1', { kind: 'done' });

    // The result id is still stored: the file may exist even though the lookup
    // failed, and the id is how a later visit asks for it again.
    expect(mockFinish).toHaveBeenCalledWith('m1', {
      renderedAt: expect.any(Number),
      durationSec: 4,
      videoId: 'result-1',
    });
    expect(mockFinish.mock.calls[0][1].uri).toBeUndefined();
  });

  // The cover is decoration: it is fetched after the movie is already `ready`,
  // and it is written by its own action rather than being part of the render the
  // job finished with — a download nobody waits for must never hold a finished
  // movie in `generating`.
  it('brings the render cover local after finishing, keyed on the render', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-9' });
    mockGetEditedVideo.mockResolvedValue({
      editedUrl: 'https://x/e.mp4',
      thumbnailUrl: 'https://x/t.jpg?sig=abc',
      durationSeconds: 11,
    });
    mockDownloadThumbnail.mockResolvedValue('file:///cache/movie-covers/m1-1.jpg');

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    const renderedAt = mockFinish.mock.calls[0][1].renderedAt;
    expect(mockFinish.mock.calls[0][1].thumbnailUri).toBeUndefined();
    expect(mockDownloadThumbnail).toHaveBeenCalledWith(
      'https://x/t.jpg?sig=abc',
      `m1-${renderedAt}`,
    );
    expect(mockSetThumbnail).toHaveBeenCalledWith(
      'm1',
      renderedAt,
      'file:///cache/movie-covers/m1-1.jpg',
    );
  });

  it('writes no cover when the download could not produce one', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-9' });
    mockGetEditedVideo.mockResolvedValue({
      editedUrl: 'https://x/e.mp4',
      thumbnailUrl: 'https://x/t.jpg',
    });
    mockDownloadThumbnail.mockResolvedValue(undefined);

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockSetThumbnail).not.toHaveBeenCalled();
  });

  it('asks for no cover when the run produced no thumbnail', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-9' });
    mockGetEditedVideo.mockResolvedValue({ editedUrl: 'https://x/e.mp4' });

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockDownloadThumbnail).not.toHaveBeenCalled();
  });

  it('finishes a job that ended while the app was away, without any frame arriving', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-1' });

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockFinish).toHaveBeenCalledWith('m1', expect.objectContaining({ durationSec: 4 }));
  });

  // The reason shown is worded from the classification code — the server's own
  // message is a diagnostic, carried as the demoted detail rather than spoken.
  it('fails a job with copy worded from its code, keeping the diagnostic apart', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    await emit('job-1', { kind: 'failed', error: serverReason, code: 'TIMEOUT' });

    expect(mockFail).toHaveBeenCalledWith('m1', editFailureMessage('TIMEOUT'), serverReason);
    expect(mockFail.mock.calls[0][1]).not.toBe(serverReason);
  });

  it('fails a job the backend reports as failed on the catch-up pass', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({
      status: 'failed',
      progress: 60,
      videoId: 'result-1',
      errorMessage: serverReason,
      errorCode: 'INTERNAL',
    });

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockFail).toHaveBeenCalledWith('m1', editFailureMessage('INTERNAL'), serverReason);
  });

  // A canceled run is not a failure: the movie returns to `draft`, keeps no
  // reason, and — unlike either real ending — is announced to nobody.
  it('returns a movie whose run was canceled to a draft, on the socket frame', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    await act(async () => {
      await renderHook(() => useGenerationRunner({ announce: true }));
    });
    mockAnnounce.mockClear();

    await emit('job-1', { kind: 'canceled' });

    expect(mockCancel).toHaveBeenCalledWith('m1');
    expect(mockFail).not.toHaveBeenCalled();
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  // A job canceled while the app was away — another session, or account
  // deletion — must not read as still running, or the movie would poll forever.
  it('returns a canceled job to a draft on the catch-up pass', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'canceled', progress: 60, videoId: 'result-1' });

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockCancel).toHaveBeenCalledWith('m1');
    expect(mockFail).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  // Also how a movie left generating by a build that predates the real backend
  // gets out: its job id was local, so no run ever existed for it.
  it('fails a job the backend has never heard of', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockRejectedValue(new ApiError('not_found', 'not found', { status: 404 }));

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockFail).toHaveBeenCalledWith('m1', expect.stringContaining('\uC11C\uBC84'), undefined); // 서버
  });

  it('leaves a job running when this device cannot reach the backend', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockRejectedValue(new ApiError('network_error', 'network'));

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockFail).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not read job-1'),
      expect.stringContaining('network'),
    );
    warnSpy.mockRestore();
  });

  it('fails a job whose originals were all deleted, without asking the backend', async () => {
    mockSnapIndex.mockReturnValue(new Map());
    mockMovies.mockReturnValue([generatingMovie()]);

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockFail).toHaveBeenCalledWith(
      'm1',
      expect.stringContaining('\uC2A4\uB0C5 \uC6D0\uBCF8'),
      undefined,
    ); // 스냅 원본
    expect(mockGetEditJob).not.toHaveBeenCalled();
  });

  it('waits for the snap library before judging whether a job lost its material', async () => {
    // Pre-hydration every cut looks deleted; failing here would kill every job
    // in flight on the first pass of an app start.
    mockSnapsHydrated.mockReturnValue(false);
    mockSnapIndex.mockReturnValue(new Map());
    mockMovies.mockReturnValue([generatingMovie()]);

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockFail).not.toHaveBeenCalled();
    expect(mockSockets.size).toBe(0);
  });

  it.each(['draft', 'ready', 'failed'] as const)('leaves a %s movie alone', async (status) => {
    mockMovies.mockReturnValue([generatingMovie({ status, job: undefined })]);

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockSockets.size).toBe(0);
    expect(mockAdvance).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('says nothing when the completion notification is off', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-1' });

    await act(async () => {
      await renderHook(() => useGenerationRunner());
    });

    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it('announces a job that finished while the user was elsewhere', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    mockGetEditJob.mockResolvedValue({ status: 'done', progress: 100, videoId: 'result-1' });

    await act(async () => {
      await renderHook(() => useGenerationRunner({ announce: true }));
    });

    expect(mockAnnounce).toHaveBeenCalledWith('ready', expect.objectContaining({ id: 'm1' }));
  });

  it('announces a failure too, so a broken job is not silent', async () => {
    mockSnapIndex.mockReturnValue(new Map());
    mockMovies.mockReturnValue([generatingMovie()]);

    await act(async () => {
      await renderHook(() => useGenerationRunner({ announce: true }));
    });

    expect(mockAnnounce).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ id: 'm1' }),
      expect.any(String),
    );
  });

  it('closes its sockets and stops writing once it is unmounted', async () => {
    mockMovies.mockReturnValue([generatingMovie()]);
    let unmount = () => {};
    await act(async () => {
      ({ unmount } = await renderHook(() => useGenerationRunner()));
    });

    // The catch-up pass has already written the progress it found on mount.
    mockAdvance.mockClear();

    await act(async () => {
      unmount();
    });
    await emit('job-1', { kind: 'progress', progress: 60, step: cutStep });

    expect(mockCloseSocket).toHaveBeenCalledWith('job-1');
    expect(mockAdvance).not.toHaveBeenCalled();
  });
});
