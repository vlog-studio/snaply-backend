import type { ApiContract } from '@vlog-studio/shared-types';

/** One endpoint of the backend contract (`apiContract` in `@vlog-studio/shared-types`). */
export type ApiRoute = ApiContract[keyof ApiContract];

/**
 * An endpoint path literally present in the contract, in its OpenAPI spelling
 * (`/videos/{id}`). The registry is imported as a type only, so the contract
 * package is not part of the app bundle.
 */
export type ApiPath = ApiRoute['path'];

declare const resolvedApiPath: unique symbol;

/**
 * An `ApiPath` whose `{param}` placeholders have been substituted by
 * `apiPath()`. Branded so `apiRequest` accepts it while rejecting arbitrary
 * strings that never appeared in the spec. The brand carries the original
 * template path, so `apiRequest` can still derive that endpoint's query, body,
 * and response types after the placeholders are gone.
 */
export type ResolvedApiPath<P extends ApiPath = ApiPath> = string & {
  readonly [resolvedApiPath]: P;
};

type PathParamNames<P extends string> = P extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PathParamNames<Rest>
  : never;

/**
 * Substitute `{param}` placeholders in a spec path with URL-encoded values.
 * The path must exist in the generated schema and every placeholder must be
 * supplied — both are checked at compile time.
 */
export function apiPath<P extends ApiPath>(
  path: P,
  ...args: [PathParamNames<P>] extends [never]
    ? []
    : [params: Record<PathParamNames<P>, string | number>]
): ResolvedApiPath<P> {
  const params = args[0] as Record<string, string | number> | undefined;
  const resolved = params
    ? path.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(params[name])))
    : path;
  return resolved as ResolvedApiPath<P>;
}
