import type { ApiSocketHandlers } from '@/shared/api';

import { subscribeEditProgress, type EditProgressEvent } from './subscribe-edit-progress';

// The socket under test is the real-server path, so mock mode is off.
jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false, API_SOCKET_BASE_URL: 'ws://test' }));

const mockClose = jest.fn();
let mockOpened: { path: string; handlers: ApiSocketHandlers } | undefined;

jest.mock('@/shared/api', () => ({
  openApiSocket: jest.fn((path: string, handlers: ApiSocketHandlers) => {
    mockOpened = { path, handlers };
    return { close: () => mockClose() };
  }),
}));

const musicStep = '\uC74C\uC545 \uB9E4\uCE6D \uC911...'; // 음악 매칭 중...
const doneStep = '\uC644\uB8CC'; // 완료
const startStep = '\uC2DC\uC791'; // 시작
const failureReason = '\uD3B8\uC9D1 \uC2E4\uD328'; // 편집 실패

/** Feeds one server frame through the subscription and returns what came out. */
function receive(payload: unknown): EditProgressEvent[] {
  const events: EditProgressEvent[] = [];
  const socket = subscribeEditProgress('job-1', { onEvent: (event) => events.push(event) });
  mockOpened?.handlers.onMessage(payload);
  socket.close();
  return events;
}

describe('subscribeEditProgress', () => {
  // Dropping a frame warns in dev builds; the cases below drop several on
  // purpose, and the warnings are the module working rather than test noise.
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpened = undefined;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warn.mockRestore());

  it('subscribes to the job it was asked about', () => {
    subscribeEditProgress('job 1/2', { onEvent: jest.fn() });
    expect(mockOpened?.path).toBe('/edit-jobs/job%201%2F2/progress');
  });

  it('reports a milestone with its label', () => {
    expect(receive({ progress: 60, step: musicStep })).toEqual([
      { kind: 'progress', progress: 60, step: musicStep },
    ]);
  });

  // The server has no `done` status: the run's last publish is a progress frame
  // at 100 that carries the rendered file.
  it('reads progress 100 as the end of the run, with the file it produced', () => {
    expect(receive({ progress: 100, step: doneStep, outputUrl: 'https://x/edited.mp4' })).toEqual([
      { kind: 'done', outputUrl: 'https://x/edited.mp4' },
    ]);
  });

  // Reconnecting to a job that finished while the app was away gets this — no
  // URL. The caller has to ask the REST endpoints what the run produced.
  it('reads a bare progress 100 as the end of the run with no file', () => {
    expect(receive({ progress: 100, step: doneStep })).toEqual([{ kind: 'done' }]);
  });

  it('reports a failure with the diagnostic and classification the server gave', () => {
    expect(receive({ status: 'failed', error: failureReason, code: 'TIMEOUT' })).toEqual([
      { kind: 'failed', error: failureReason, code: 'TIMEOUT' },
    ]);
  });

  it('reports a failure that came with no reason', () => {
    expect(receive({ status: 'failed' })).toEqual([
      { kind: 'failed', error: undefined, code: undefined },
    ]);
  });

  // Published by the cancel endpoint as it ends the run — from this device or
  // another session — right before the server closes the socket.
  it('reports a cancellation', () => {
    expect(receive({ status: 'canceled' })).toEqual([{ kind: 'canceled' }]);
  });

  it.each([
    ['a frame of another shape', { hello: 'world' }],
    ['a frame with no progress', { step: startStep }],
    ['a non-object frame', 42],
    ['null', null],
  ])('drops %s rather than guessing at it', (_label, payload) => {
    expect(receive(payload)).toEqual([]);
  });

  it('closes the underlying socket', () => {
    const socket = subscribeEditProgress('job-1', { onEvent: jest.fn() });
    socket.close();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
