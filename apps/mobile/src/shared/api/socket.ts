import { API_SOCKET_BASE_URL } from '@/shared/config/api';

import { authHeader } from './auth-header';

/**
 * Open a socket with request headers on the handshake.
 *
 * React Native's `WebSocket` takes a third argument that `lib.dom` does not know
 * about — per-connection headers, applied to the opening handshake
 * (`Libraries/WebSocket/WebSocket.js`) — so reaching it costs a cast. It is worth
 * it: the alternative is the backend's `?token=` query parameter, which writes a
 * live credential into every proxy and access log on the way.
 *
 * The cast is scoped to this one call rather than a module-level alias, so
 * nothing else in the file can reach a `WebSocket` typed as something the DOM
 * lib does not describe.
 */
function openWithHeaders(url: string, headers: Record<string, string>): WebSocket {
  const NativeWebSocket = WebSocket as unknown as new (
    url: string,
    protocols?: string[] | null,
    options?: { headers?: Record<string, string> },
  ) => WebSocket;
  return new NativeWebSocket(url, null, { headers });
}

export type ApiSocketHandlers = {
  /** One parsed JSON frame. Frames that are not JSON never reach here. */
  onMessage: (payload: unknown) => void;
  /** The socket could not be opened, or the server closed it with an error. */
  onError?: (error: Error) => void;
  /** The connection ended, however it ended. Always the last call. */
  onClose?: () => void;
};

/** A live subscription. Closing twice, or before the socket opened, is safe. */
export type ApiSocket = { close: () => void };

/**
 * Open a WebSocket against the backend origin.
 *
 * Transport only, exactly like `apiRequest`: the origin, the JWT handshake
 * header, JSON decoding, and the close/error normalization. It knows nothing
 * about what any endpoint streams — the caller validates each payload and maps
 * it to a domain event.
 *
 * The `path` is a plain string rather than an `ApiPath`, because **WebSocket
 * endpoints are not in the OpenAPI spec** and cannot be: the backend hides the
 * route from its own document (`schema: { hide: true }`) and states the contract
 * in prose instead (its `docs/api-spec.md`). Nothing here can be checked against
 * generated types, which is exactly why callers validate payloads with Zod.
 *
 * Returns synchronously so an effect can hand back its cleanup immediately, even
 * though the token read is asynchronous: closing a subscription whose socket has
 * not been created yet cancels it instead of leaking one that opens after the
 * screen is gone.
 */
export function openApiSocket(path: string, handlers: ApiSocketHandlers): ApiSocket {
  let socket: WebSocket | undefined;
  let closed = false;

  const fail = (error: Error) => {
    if (closed) return;
    closed = true;
    handlers.onError?.(error);
    handlers.onClose?.();
  };

  void (async () => {
    let headers: Record<string, string>;
    try {
      headers = await authHeader();
    } catch (cause) {
      fail(new Error('소켓 인증 토큰을 읽지 못했습니다.', { cause }));
      return;
    }
    if (closed) return;

    const url = `${API_SOCKET_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      socket = openWithHeaders(url, headers);
    } catch (cause) {
      fail(new Error('소켓을 열지 못했습니다.', { cause }));
      return;
    }

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        // The server is the only sender and sends JSON; a frame that is not
        // JSON is a bug there, not a state this side can act on.
        if (__DEV__) console.warn(`[socket] dropped a non-JSON frame from ${path}`);
        return;
      }
      if (!closed) handlers.onMessage(payload);
    };
    // `onerror` is followed by `onclose`, so the close handler is left to run
    // once rather than being called from both.
    socket.onerror = () => {
      if (!closed) handlers.onError?.(new Error('소켓 연결에 오류가 발생했습니다.'));
    };
    socket.onclose = () => {
      if (closed) return;
      closed = true;
      handlers.onClose?.();
    };
  })();

  return {
    close: () => {
      if (closed) return;
      closed = true;
      socket?.close();
    },
  };
}
