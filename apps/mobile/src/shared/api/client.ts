import type { z } from 'zod';

import { API_BASE_URL } from '@/shared/config/api';

import { ApiError } from './api-error';
import { authHeader } from './auth-header';
import { notifyApiError } from './error-listeners';
import type { ApiPath, ApiRoute, ResolvedApiPath } from './paths';

type QueryValue = string | number | boolean | undefined | null;

/**
 * The methods the contract defines for a path. Derived from the route registry
 * in `@vlog-studio/shared-types` — the same Zod schemas the backend validates
 * and serializes with, so a mismatch here is a mismatch with the server.
 */
export type ApiMethod<P extends ApiPath> = Extract<ApiRoute, { path: P }>['method'];

type HttpMethod = ApiRoute['method'];

// `M extends HttpMethod` rather than `ApiMethod<P>`: TypeScript cannot relate a
// type parameter to that deferred indexed type, so the "method exists for this
// path" rule is enforced by `MethodRule` below instead of by the constraint.
type RouteSchemaOf<P extends ApiPath, M extends HttpMethod> = Extract<
  ApiRoute,
  { path: P; method: M }
>['schema'];

/**
 * `method` may be omitted only where the runtime default (GET) is a route the
 * contract defines — otherwise omitting it would silently GET a POST-only
 * endpoint. A method the contract does not define for the path intersects to
 * `never`, so the error lands on the `method` line and nowhere else.
 */
type MethodRule<P extends ApiPath, M extends HttpMethod> =
  'GET' extends ApiMethod<P> ? { method?: M & ApiMethod<P> } : { method: M & ApiMethod<P> };

/** The route's query parameters as the caller supplies them; `never` when it takes none. */
type QueryOf<S> = S extends { querystring: infer Q extends z.ZodType } ? z.input<Q> : never;

/** The route's JSON request body as the caller supplies it; `never` when it takes none. */
type BodyOf<S> = S extends { body: infer B extends z.ZodType } ? z.input<B> : never;

type SuccessStatus = 200 | 201 | 202;

/**
 * The `data` carried by the route's success envelope (2xx response).
 * `unknown` — imposing no constraint — when the contract declares none.
 */
type ApiSuccessData<S> = S extends { response: infer R }
  ? {
      [C in Extract<keyof R, SuccessStatus>]: R[C] extends z.ZodType
        ? z.output<R[C]> extends { success: true; data: infer D }
          ? D
          : unknown
        : unknown;
    }[Extract<keyof R, SuccessStatus>]
  : unknown;

/**
 * The response contract: a Zod schema whose output the contract's `data` must be
 * assignable to. Assignable-to rather than equal on purpose — the project
 * validates only the fields the app consumes, so a schema may narrow the
 * contract (omit fields, widen an enum to `string`) but may not invent a field
 * or disagree on a type. On mismatch, the marker property below surfaces in the
 * compile error and names the contract type the schema must accept.
 */
// `[S] extends [never]` first: with an unknown path/method pairing there is no
// route to check against, and that mistake is already reported on `method`.
type ResponseSchema<S, T> = [S] extends [never]
  ? z.ZodType<T>
  : z.ZodType<T> &
      ([ApiSuccessData<S>] extends [T]
        ? unknown
        : { __schemaMustAcceptApiData: ApiSuccessData<S> });

export type ApiRequestOptions<P extends ApiPath, M extends HttpMethod, T> = {
  query?: QueryOf<RouteSchemaOf<P, M>>;
  /** Serialized as JSON; omit for bodyless requests. */
  body?: BodyOf<RouteSchemaOf<P, M>>;
  /** Validates and types the envelope's `data` field. */
  schema: ResponseSchema<RouteSchemaOf<P, M>, T>;
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
} & MethodRule<P, M>;

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
 * Fully typed against the backend contract: the path (or the template a
 * `ResolvedApiPath` was built from) and the method select the route, and from
 * its Zod schemas come the allowed `query` keys, the `body` shape, and the
 * response `data` the call's schema must be compatible with — a typo'd request
 * field or a schema that contradicts the contract is a compile error, at the
 * call site.
 */
export async function apiRequest<P extends ApiPath, T, M extends HttpMethod = 'GET'>(
  path: P | ResolvedApiPath<P>,
  options: ApiRequestOptions<P, M, T>,
): Promise<T> {
  try {
    return await performRequest(path, options);
  } catch (error) {
    // Announce every normalized failure once, here at the single exit, so a
    // subscriber sees all of them regardless of which caller made the request.
    if (error instanceof ApiError) notifyApiError(error);
    throw error;
  }
}

async function performRequest<P extends ApiPath, T, M extends HttpMethod = 'GET'>(
  path: P | ResolvedApiPath<P>,
  options: ApiRequestOptions<P, M, T>,
): Promise<T> {
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
