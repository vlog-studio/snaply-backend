import { openApiSocket } from './socket';

const mockAuthHeader = jest.fn<Promise<Record<string, string>>, []>();

jest.mock('@/shared/config/api', () => ({
  API_SOCKET_BASE_URL: 'wss://api.example.test/root/',
}));

jest.mock('./auth-header', () => ({
  authHeader: () => mockAuthHeader(),
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static constructorError: Error | undefined;

  readonly close = jest.fn();
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols?: string[] | null,
    readonly options?: { headers?: Record<string, string> },
  ) {
    if (MockWebSocket.constructorError) throw MockWebSocket.constructorError;
    MockWebSocket.instances.push(this);
  }
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('openApiSocket', () => {
  const originalWebSocket = globalThis.WebSocket;
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  beforeAll(() => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    MockWebSocket.instances = [];
    MockWebSocket.constructorError = undefined;
    mockAuthHeader.mockResolvedValue({ Authorization: 'Bearer token-1' });
  });

  afterAll(() => {
    globalThis.WebSocket = originalWebSocket;
    warnSpy.mockRestore();
  });

  it('opens against the configured origin with handshake authentication', async () => {
    openApiSocket('edit-jobs/job-1/progress', { onMessage: jest.fn() });

    await flushMicrotasks();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]).toMatchObject({
      url: 'wss://api.example.test/root/edit-jobs/job-1/progress',
      protocols: null,
      options: { headers: { Authorization: 'Bearer token-1' } },
    });
  });

  it('delivers parsed JSON and drops frames the application cannot interpret', async () => {
    const onMessage = jest.fn();
    openApiSocket('/events', { onMessage });
    await flushMicrotasks();
    const socket = MockWebSocket.instances[0];

    socket.onmessage?.({
      data: JSON.stringify({ kind: 'progress', progress: 25 }),
    } as MessageEvent);
    socket.onmessage?.({ data: '{not-json' } as MessageEvent);
    socket.onmessage?.({ data: new ArrayBuffer(0) } as MessageEvent);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ kind: 'progress', progress: 25 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-JSON frame'));
  });

  it('cancels an opening socket when the subscriber closes before authentication returns', async () => {
    let resolveHeader!: (headers: Record<string, string>) => void;
    mockAuthHeader.mockReturnValue(
      new Promise((resolve) => {
        resolveHeader = resolve;
      }),
    );
    const subscription = openApiSocket('/events', { onMessage: jest.fn() });

    subscription.close();
    resolveHeader({ Authorization: 'Bearer late-token' });
    await flushMicrotasks();

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('reports an authentication read failure and then closes exactly once', async () => {
    const onError = jest.fn();
    const onClose = jest.fn();
    mockAuthHeader.mockRejectedValue(new Error('secure storage unavailable'));

    openApiSocket('/events', { onMessage: jest.fn(), onError, onClose });
    await flushMicrotasks();

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ cause: expect.any(Error) }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('normalizes a synchronous handshake failure', async () => {
    const cause = new Error('native constructor failed');
    const onError = jest.fn();
    const onClose = jest.fn();
    MockWebSocket.constructorError = cause;

    openApiSocket('/events', { onMessage: jest.fn(), onError, onClose });
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ cause }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports a connection error and waits for close before the close callback', async () => {
    const onError = jest.fn();
    const onClose = jest.fn();
    openApiSocket('/events', { onMessage: jest.fn(), onError, onClose });
    await flushMicrotasks();
    const socket = MockWebSocket.instances[0];

    socket.onerror?.();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    socket.onclose?.();
    socket.onclose?.();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the native socket at most once', async () => {
    const subscription = openApiSocket('/events', { onMessage: jest.fn() });
    await flushMicrotasks();
    const socket = MockWebSocket.instances[0];

    subscription.close();
    subscription.close();

    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
