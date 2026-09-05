import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * 한 엔드포인트의 스키마 묶음. Fastify `schema` 와 같은 키를 쓰므로 라우트 등록 시 그대로
 * 펼친다. 백엔드는 이 스키마로 요청을 검증하고 응답을 직렬화하며, OpenAPI 도 여기서 나온다.
 */
export interface RouteSchema {
  params?: z.ZodType;
  querystring?: z.ZodType;
  body?: z.ZodType;
  /** 상태 코드별 응답 바디. 없으면 JSON 계약이 없는 라우트(리다이렉트 등)다. */
  response?: Readonly<Record<number, z.ZodType>>;
}

/** OpenAPI 표기(`/videos/{id}`)를 Fastify 표기(`/videos/:id`)로 바꾼 타입. */
export type FastifyPath<P extends string> = P extends `${infer Head}{${infer Name}}${infer Rest}`
  ? `${Head}:${Name}${FastifyPath<Rest>}`
  : P;

export interface RouteDefinition<
  M extends HttpMethod = HttpMethod,
  P extends string = string,
  S extends RouteSchema = RouteSchema,
> {
  readonly method: M;
  /** OpenAPI 표기 경로. 앱은 이 형태로 부른다 — `apiPath('/edit-jobs/{id}', { id })`. */
  readonly path: P;
  /** Fastify 표기 경로. 서버 라우트 등록에만 쓴다. */
  readonly fastifyPath: FastifyPath<P>;
  readonly schema: S;
}

/**
 * 엔드포인트 하나를 선언한다. 경로는 OpenAPI 표기로 적고, Fastify 표기는 여기서 유도한다 —
 * 두 표기를 손으로 같이 적으면 그 순간 사본이 둘이 된다.
 */
export function defineRoute<M extends HttpMethod, const P extends string, const S extends RouteSchema>(
  definition: { method: M; path: P; schema: S },
): RouteDefinition<M, P, S> {
  return {
    ...definition,
    fastifyPath: definition.path.replace(/\{([^}]+)\}/g, ':$1') as FastifyPath<P>,
  };
}
