import type { z } from 'zod';

import { API_BASE_URL } from '@/shared/config/api';

import { ApiError } from './api-error';
import { authHeader } from './auth-header';
import { notifyApiError } from './error-listeners';
import type { ApiPath, ResolvedApiPath } from './paths';
import type { paths } from './schema';

type QueryValue = string | number | boolean | undefined | null;
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** How `apiRequest`'s uppercase methods index the generated (lowercase) spec. */
type MethodKeyMap = { GET: 'get'; POST: 'post'; PATCH: 'patch'; DELETE: 'delete' };

/**
 * The methods the spec actually defines for a path. An absent method is
 * generated as `get?: never`, so it reads back as `undefined` here.
 */
export type ApiMethod<P extends ApiPath> = {
  [M in HttpMethod]: paths[P][MethodKeyMap[M]] extends undefined ? never : M;
}[HttpMethod];

type OperationOf<P extends ApiPath, M extends ApiMethod<P>> = NonNullable<
  paths[P][MethodKeyMap[M]]
>;

/** The operation's query parameters; `never` when it takes none. */
type QueryOf<Op> = Op extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

/** The operation's JSON request body; `never` when it takes none. */
// The bodyless case needs its own branch: an absent body is generated as
// `requestBody?: never`, and `never extends { content: … }` is trivially true,
// which would leave `B` unconstrained instead of forbidding the body.
type BodyOf<Op> = Op extends { requestBody?: infer RB }
  ? [NonNullable<RB>] extends [never]
    ? never
    : NonNullable<RB> extends { content: { 'application/json': infer B } }
      ? B
      : never
  : never;

/**
 * The `data` carried by the operation's success envelope (2xx JSON response).
 * `unknown` — imposing no constraint — when the spec declares none.
 */
type ApiSuccessData<Op> = Op extends { responses: infer Rs }
  ? {
      [C in Extract<keyof Rs, 200 | 201 | 202>]: Rs[C] extends {
        content: { 'application/json': { success: true; data: infer D } };
      }
        ? D
        : unknown;
    }[Extract<keyof Rs, 200 | 201 | 202>]
  : unknown;

/**
 * The response contract: a Zod schema whose output the spec's `data` must be
 * assignable to. Assignable-to rather than equal on purpose — the project
 * validates only the fields the app consumes, so a schema may narrow the spec
 * (omit fields, widen an enum to `string`) but may not invent a field or
 * disagree on a type. On mismatch, the marker property below surfaces in the
 * compile error and names the spec type the schema must accept.
 */
type ResponseSchema<Op, T> = z.ZodType<T> &
  ([ApiSuccessData<Op>] extends [T] ? unknown : { __schemaMustAcceptApiData: ApiSuccessData<Op> });

export type ApiRequestOptions<P extends ApiPath, M extends ApiMethod<P>, T> = {
  query?: QueryOf<OperationOf<P, M>>;
  /** Serialized as JSON; omit for bodyless requests. */
  body?: BodyOf<OperationOf<P, M>>;
  /** Validates and types the envelope's `data` field. */
  schema: ResponseSchema<OperationOf<P, M>, T>;
  signal?: AbortSignal;
  /**
   * Give up after this many milliseconds and fail as a `network_error`.
   *
   * Opt-in, because most callers are answered by a screen that can wait: with
   * no timeout a request to an unreachable host hangs for the platform's own
   * TCP timeout, and under a retrying query that stacks. Pass it wherever a
   * screen is *holding a state* on the answer — a spinner with no end is worse
   * than a failure with a retry.
   */
  timeoutMs?: number;
  // `method` may be omitted only where the runtime default (GET) is an
  // operation the spec defines — otherwise omitting it would silently GET a
  // POST-only endpoint.
} & ('GET' extends ApiMethod<P> ? { method?: M } : { method: M });

/** The common success/failure envelope every endpoint returns. */
type ApiEnvelope =
  | { success: true; data: unknown }
  // The error object is open: an endpoint may put a field of its own next to
  // `code`/`message` (the pending-deletion 403 carries `purgeAfter`). The
  // transport passes those through as `ApiError.details` without reading them.
  | { success: false; error?: { code?: string; message?: string; [key: string]: unknown } };

function isEnvelope(value: unknown): value is ApiEnvelope {
  return typeof value === 'object' && value !== null && 'success' in value;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) search.append(key, String(value));
  }
  const queryString = search.toString();
  return queryString ? `${url}?${queryString}` : url;
}

/**
 * The single HTTP entry point for the backend. It owns transport concerns only:
 * URL/query building, JWT injection, the shared response envelope, and error
 * normalization into `ApiError`. It never knows about domain models — callers in
 * an entity/page `api` segment map the validated `data` to their domain type.
 *
 * Fully typed against the generated spec: the path (or the template a
 * `ResolvedApiPath` was built from) and the method select the operation, and
 * from it come the allowed `query` keys, the `body` shape, and the response
 * `data` the Zod schema must be compatible with — a typo'd request field or a
 * schema that contradicts the spec is a compile error, at the call site.
 */
export async function apiRequest<
  P extends ApiPath,
  T,
  M extends ApiMethod<P> = Extract<'GET', ApiMethod<P>>,
>(path: P | ResolvedApiPath<P>, options: ApiRequestOptions<P, M, T>): Promise<T> {
  try {
    return await performRequest(path, options);
  } catch (error) {
    // Announce every normalized failure once, here at the single exit, so a
    // subscriber sees all of them regardless of which caller made the request.
    if (error instanceof ApiError) notifyApiError(error);
    throw error;
  }
}

async function performRequest<
  P extends ApiPath,
  T,
  M extends ApiMethod<P> = Extract<'GET', ApiMethod<P>>,
>(path: P | ResolvedApiPath<P>, options: ApiRequestOptions<P, M, T>): Promise<T> {
  const { method = 'GET', query, body, schema, signal, timeoutMs } = options;

  // The caller's own signal still cancels; the deadline only adds a second way
  // for the request to end. Cleared in `finally` so a fast answer leaves no
  // timer behind.
  const deadline = timeoutMs === undefined ? undefined : new AbortController();
  const timer = deadline === undefined ? undefined : setTimeout(() => deadline.abort(), timeoutMs);
  const abortDeadline = () => deadline?.abort();
  signal?.addEventListener('abort', abortDeadline);

  let response: Response;
  try {
    // The spec-derived query type is an exact object; the URL builder only
    // needs to know its values are primitives.
    response = await fetch(buildUrl(path, query as Record<string, QueryValue> | undefined), {
      method,
      signal: deadline?.signal ?? signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(await authHeader()),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError('network_error', '네트워크 요청에 실패했습니다.', { cause });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', abortDeadline);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError('malformed_response', '서버 응답을 해석할 수 없습니다.', {
      status: response.status,
      cause,
    });
  }

  if (!isEnvelope(payload)) {
    throw new ApiError('malformed_response', '서버 응답 형식이 올바르지 않습니다.', {
      status: response.status,
    });
  }

  if (!payload.success) {
    const { code, message, ...details } = payload.error ?? {};
    throw new ApiError(code ?? 'unknown_error', message ?? '요청을 처리하지 못했습니다.', {
      status: response.status,
      details,
    });
  }

  return schema.parse(payload.data);
}
