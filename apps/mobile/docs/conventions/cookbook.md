# Implementation cookbook

A cookbook of the recurring, copy-followable patterns already implemented in this
codebase. Where the other convention documents state *rules*
([module boundaries](./module-boundaries.md), [SOLID](./solid-react-native.md)) and
*placement* ([state and data](../frameworks/state-and-data.md)), this document points
to the *canonical implementation* to imitate for each common task, so a new slice
looks like the existing ones.

Each pattern lists **when to use it**, the **canonical file(s)** to read first, a
**skeleton** to adapt, and **rules** (including what not to do).

## Scope: which code lives here

- **Copy-followable skeletons live only in this document.** Other documents link to a
  section anchor here instead of carrying their own copy of the code.
- **Rule-illustrating snippets stay with the rule** they illustrate — the ✅/❌ import
  contrasts belong to [module boundaries](./module-boundaries.md), the props-contract
  contrast to [SOLID](./solid-react-native.md).
- **Shell procedures, directory trees, and config contents stay in their workflow and
  architecture documents** — they are steps and structure, not patterns to copy.

When a new recurring skeleton emerges elsewhere in the docs, move it here and link back,
rather than letting two copies drift apart.

## How to use this document

- Adding a screen → §1, §14.
- Reading data from the backend → §2, §3, §4 (in that order), consumed via §5-adjacent code.
- Writing data / firing a server action → §5.
- Sharing client state across components → §7, §8 (§8a when the data belongs to the signed-in account rather than to the device).
- Swapping an external dependency (auth, storage) behind an interface → §9.
- Orchestrating a user action with pending/error state → §10.
- Loading/mutating a device-local resource → §11.
- Wrapping a device/native API or supporting web → §12, §13.
- Consuming the design system in UI → §14.
- Building a form → §16 (and §16a for its test).
- Testing any of the above → §15.

## Reading the skeletons: they are starting points, not contracts

The skeletons below capture the **shape and the responsibility split** of each pattern —
which concern lives in which file, what crosses a boundary, what stays internal. Copy
the structure; the exact lines are illustrative. `/* ... */` marks bodies you fill in.

### When to deviate

Prefer the skeleton, but **bypass it** when any of the following holds — deviating is
the correct call, not a violation:

1. **The dependency's official, version-specific docs prescribe a different API or
   shape.** These skeletons can lag an SDK. Per [rule precedence](../../AGENTS.md#rule-precedence),
   official version-specific docs outrank this document. Before writing Expo code, read
   the relevant [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) page; base
   TanStack Query / Zustand / Zod usage on their current docs, not on the snippet here.
2. **The skeleton is impossible or clearly inefficient for the case.** Pagination,
   streaming/SSE, batched or composite endpoints, cursor caches, optimistic mutation
   rollback, and similar cases legitimately need a different structure.
3. **Forcing the pattern would create a premature or wrong abstraction.** If the
   product shape does not actually match the pattern, do not bend it to fit — see
   [feature development §3](../workflows/feature-development.md) ("extract only with evidence").

### How to deviate responsibly

- **Preserve the invariant, not the syntax.** Keep the responsibility boundaries
  (transport ≠ mapping ≠ query key ≠ product flow) and the Public-API boundaries even
  when the code shape differs. That is what makes a slice recognizable, not the literal
  skeleton.
- **One-off deviation:** leave a short comment at the site explaining why the standard
  shape did not fit.
- **New recurring shape:** update this document (adjust or add a pattern) rather than
  silently spreading an undocumented exception, per
  [AGENTS "If documentation and implementation diverge"](../../AGENTS.md#rule-precedence).

### What is *not* a skeleton you may bypass

The [module-boundary rules](./module-boundaries.md), the FSD layer import direction,
and the [cross-cutting principles](#cross-cutting-principles-these-patterns-share) at
the end of this document are **rules**, not illustrative skeletons. Changing them needs
the escalation path in [feature development](../workflows/feature-development.md)
(move orchestration up a layer) or a documented architecture exception — not an inline
bypass.

---

## 1. Thin route adapter

**When:** every file under `src/app`. Routes wire a URL to a page; they hold no logic.

**Canonical:** [`src/app/(tabs)/index.tsx`](<../../src/app/(tabs)/index.tsx>),
[`src/app/(tabs)/snaps.tsx`](<../../src/app/(tabs)/snaps.tsx>),
[`src/app/_layout.tsx`](../../src/app/_layout.tsx).

```ts
// src/app/(tabs)/index.tsx — the common case: re-export the page Public API
export { StudioPage as default } from '@/pages/studio';

// src/app/_layout.tsx — same shape for the root layout: implementation lives in _app
export { RootLayout as default } from '@/_app/routes';
```

```tsx
// src/app/(tabs)/snaps.tsx — thin adapter variant: read params, pass as explicit props
import { useLocalSearchParams } from 'expo-router';

import { SnapsPage } from '@/pages/snaps';

export default function SnapsRoute() {
  const { select } = useLocalSearchParams<{ select?: string }>();
  return <SnapsPage startSelecting={select === '1'} />;
}
```

**Rules**
- Re-export a page Public API as `default`, or wrap it in a thin adapter that only reads
  route params and passes them as explicit props.
- No business logic, no reusable components, no data fetching in `src/app`.
- A route adapter imports only the Public API of `_app` or `pages` (see
  [module boundaries](./module-boundaries.md), [expo-router](../frameworks/expo-router.md)).

---

## 2. Layered data flow (transport → DTO → fetch → query factory → consumer)

**When:** reading any business resource from the backend. This is the backbone pattern;
§3–§5 are its parts.

**Canonical:** the four files of `entities/location/api`
([`location.dto.ts`](../../src/entities/location/api/location.dto.ts),
[`get-locations.ts`](../../src/entities/location/api/get-locations.ts),
[`location.queries.ts`](../../src/entities/location/api/location.queries.ts)),
the shared transport [`shared/api/client.ts`](../../src/shared/api/client.ts), and a
consumer [`use-geofence-monitoring.ts`](../../src/features/geofence-monitor/model/use-geofence-monitoring.ts).

Responsibilities, one per file:

| File | Owns | Knows domain models? |
| --- | --- | --- |
| `shared/api/client.ts` | HTTP transport: URL/query, JWT, envelope, `ApiError` | No |
| `<entity>/api/<entity>.dto.ts` | wire (snake_case) Zod schema + mapper to domain | Maps to it |
| `<entity>/api/get-<entity>.ts` | calls `apiRequest`, maps DTO → domain | Returns it |
| `<entity>/api/<entity>.queries.ts` | `queryOptions` key + fn factory | Via the fetch fn |
| consumer (`model`/`ui`) | `useQuery`/`fetchQuery` with the factory | Domain type only |

Consumption — imperative (as in the canonical feature) or via `useQuery` in a component:

```ts
// imperative, from an effect/orchestrator (see use-geofence-monitoring.ts)
const locations = await queryClient.fetchQuery(locationQueries.nearby(origin));

// declarative, from a component
const { data, isPending, error } = useQuery(locationQueries.nearby(origin));
```

**Rules**
- Keep these responsibilities in separate files. Do not fetch-and-map inside a
  component, and do not let the transport client import a domain type.
- The consumer receives the mapped **domain** type and passes the query `signal`
  through the factory (§4). `QueryClient` is owned by `_app/providers`; never construct
  one in a feature/page.
- Place the query in `entities/<entity>/api` for a single entity, or `pages/<page>/api`
  for a screen-only composite (see [state and data](../frameworks/state-and-data.md#query-and-key-placement)).

---

## 3. DTO schema + mapper (wire shape never leaks)

**When:** any endpoint whose JSON differs from the domain model (here: abbreviated wire
names `lat`/`lng` vs. the domain's `latitude`/`longitude`, plus wire fields the domain
does not carry).

**Canonical:** [`location.dto.ts`](../../src/entities/location/api/location.dto.ts).

```ts
import { z } from 'zod';

import type { Location } from '../model/location';

export const locationDtoSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  // Free-form on the backend — deliberately not narrowed to a union.
  category: z.string(),
  // ...remaining wire fields
});
export type LocationDto = z.infer<typeof locationDtoSchema>;
export const locationsDtoSchema = z.array(locationDtoSchema);

export function mapLocation(dto: LocationDto): Location {
  return {
    id: dto.id,
    latitude: dto.lat,
    longitude: dto.lng,
    category: dto.category,
    // ...
  };
}
```

**Rules**
- Validate with Zod at the transport boundary; infer the DTO type (`z.infer`) — never
  hand-declare it twice.
- The mapper is the only place the wire shape exists. DTO field names must not appear
  anywhere else in the app.
- Do not export the DTO type from the slice Public API — it is an internal wire detail.
- Declare only the fields the app maps. Zod strips the rest, so a response field the app
  ignores (`distanceMeters` here) costs nothing and does not belong in the schema.
- Narrow a field to an enum only when the backend contract guarantees the set. A
  server-side free-text field validated as a union fails the **whole** response the first
  time an unseen value appears — and a caller that swallows the error (the geofence setup
  does) turns that into a silent outage. Test the mapper: it is a pure function on a
  contract that drifts.

---

## 4. Query key + options factory

**When:** every read query, so cache keys stay consistent for caching and invalidation.

**Canonical:** [`location.queries.ts`](../../src/entities/location/api/location.queries.ts).

```ts
import { queryOptions } from '@tanstack/react-query';

import { getLocations, type GetLocationsParams } from './get-locations';

export const locationQueries = {
  all: () => ['location'] as const,
  nearby: (params: GetLocationsParams) =>
    queryOptions({
      queryKey: [...locationQueries.all(), 'nearby', params.latitude, params.longitude] as const,
      queryFn: ({ signal }) => getLocations(params, signal),
    }),
};
```

**Rules**
- Build keys from a shared `all()` root so invalidation can target the whole entity.
- Forward the TanStack `signal` into the fetch function for cancellation.
- Never hand-write raw key arrays in UI or mutation code — go through the factory.

### 4a. Start-then-poll for an async backend job

**When:** the backend accepts a request, works on it, and expects the app to poll —
and there is no progress channel to subscribe to.

**Canonical:** [`recommendation.queries.ts`](../../src/features/fill-template/api/recommendation.queries.ts).

Two factories, not one: a `request` query that starts the job and holds its id
(`staleTime: Infinity`, because asking again only re-learns the same id), and a
`result` query keyed by that id whose `refetchInterval` returns `false` as soon as
the answer is final. The consumer chains them with `enabled`.

```ts
result: (jobId: string) =>
  queryOptions({
    queryKey: [...jobQueries.all(), 'result', jobId] as const,
    queryFn: ({ signal }) => getJob(jobId, signal),
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 2_000 : false),
    staleTime: 0,
    retry: false,
  }),
```

**Rules**
- The start request must be **idempotent server-side**, since a remount re-issues it.
- `retry: false` on both when the screen has something to show without the answer —
  a retry only delays a fallback that costs the user nothing.
- Do not poll for something the backend can push. Prefer the WebSocket where one
  exists (`subscribe-edit-progress.ts`); polling is for endpoints without a channel.

---

## 5. Mock-or-real request routing (`USE_MOCK_API`)

**When:** any request to a backend endpoint that does not exist yet (the current
default: the app runs against in-code mocks until an origin is configured).

**Canonical (three identical instances):**
[`get-locations.ts`](../../src/entities/location/api/get-locations.ts),
[`register-fcm-token.ts`](../../src/features/register-push-token/api/register-fcm-token.ts),
[`report-geofence-enter.ts`](../../src/features/geofence-monitor/api/report-geofence-enter.ts).
Config: [`shared/config/api.ts`](../../src/shared/config/api.ts).

```ts
import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { X } from '../model/x';
import { xDtoSchema, mapX } from './x.dto';
import { mockXDtos } from './mock-x';

async function getXFromApi(params: GetXParams, signal?: AbortSignal): Promise<X[]> {
  const dtos = await apiRequest('/x', { method: 'GET', query: { /* ... */ }, schema: xDtoSchema, signal });
  return dtos.map(mapX);
}

// Same return type as the API branch, so callers never see the mode.
function getXMock(): Promise<X[]> {
  if (__DEV__) console.log('[x][mock] ...'); // never log secrets (tokens, credentials)
  return Promise.resolve(mockXDtos.map(mapX));
}

export function getX(params: GetXParams, signal?: AbortSignal): Promise<X[]> {
  return USE_MOCK_API ? getXMock() : getXFromApi(params, signal);
}
```

For a write whose response body is unused, validate permissively:

```ts
await apiRequest('/auth/fcm-token', { method: 'POST', body: { fcmToken }, schema: z.unknown(), signal });
```

**Rules**
- The mock and real branches must have an **identical return type** so callers never
  branch on the mode.
- Never log sensitive values (FCM tokens, credentials); log only that the call ran.
- Leave a comment describing how the mock is replaced once the real endpoint exists.

---

## 6. Normalized transport error + response envelope

**When:** always — it is built into `apiRequest`. Understand it before adding error
handling in a feature.

**Canonical:** [`shared/api/client.ts`](../../src/shared/api/client.ts),
[`shared/api/api-error.ts`](../../src/shared/api/api-error.ts).

Every endpoint returns one envelope; every failure funneled through `apiRequest` throws
one `ApiError` (stable machine-readable `code` + user-safe `message`):

```ts
type ApiEnvelope =
  | { success: true; data: unknown }
  | { success: false; error?: { code?: string; message?: string } };

// Caller reasons about a single error shape:
try {
  await getX(params);
} catch (error) {
  if (error instanceof ApiError && error.code === 'network_error') {
    /* feature-level retry/copy */
  }
}
```

**Rules**
- Transport/protocol error normalization lives only in `shared/api`.
- Business errors (missing entity, mapping) belong to the entity/page `api`; action
  failure and retry belong to the feature; screen-wide error UI belongs to the page
  (see [state and data](../frameworks/state-and-data.md#error-and-loading-states)).

---

## 7. Zustand slice: single writer + focused selector hooks

**When:** client state shared by multiple components within a slice.

**Canonical:** [`session-store.ts`](../../src/entities/session/model/session-store.ts),
exposed via [`entities/session/index.ts`](../../src/entities/session/index.ts).

```ts
// model/x-store.ts
import { create } from 'zustand';

type XState = { value: T | null; hasHydrated: boolean };

// Exported for co-located tests only; app code uses the selector hooks below.
export const useXStore = create<XState>()(() => ({ value: null, hasHydrated: false }));

// One authoritative writer per source of change (subscribe once from the root layout).
// The external source is reached through the slice's own `api` gateway, so this file
// stays in domain terms — see `entities/session/api/session-gateway.ts`.
export function initX(): () => void {
  return subscribeToX((change) => useXStore.setState({ ...change, hasHydrated: true }));
}

// Focused selector hooks are the public surface.
export function useXValue(): T | null {
  return useXStore((state) => state.value);
}
```

```ts
// index.ts — export the hooks and the initializer, not the raw store
export { initX, useXValue } from './model/x-store';
```

**Rules**
- Export **focused selector hooks**, not the raw store, from the slice Public API. The
  raw `useXStore` is exported for co-located tests only.
- Concentrate writes: one function is the authoritative writer for a given source.
  Expose domain actions, not a bag of setters.
- Components subscribe through selectors, never to the whole store.
- Keep the SDK out of `model`. When the store mirrors an external system, put the calls
  and the DTO mapping in the slice's `api` segment
  ([`session-gateway.ts`](../../src/entities/session/api/session-gateway.ts),
  [`map-user.ts`](../../src/entities/session/api/map-user.ts)) and let the store see only
  domain values. One implementation needs no interface — the module boundary is already
  the seam the store's test substitutes.

---

## 8. Persisted Zustand slice (SecureStore-backed)

**When:** client state that must survive relaunch (settings, preferences).

**Canonical:** [`notification-settings-store.ts`](../../src/features/notification-settings/model/notification-settings-store.ts).

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { secureStorage } from '@/shared/lib/secure-storage';

const useXStore = create<XState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }), // domain actions, not raw setters
    }),
    { name: 'snaply.x-settings', storage: createJSONStorage(() => secureStorage) },
  ),
);
```

**Rules**
- Namespace the `persist` key with the `snaply.` prefix.
- Back persistence with the `secureStorage` adapter, not `AsyncStorage` directly.
- If the state mirrors a future backend field, document how it becomes a server query
  once the endpoint exists (see the file's header comment).
- Decide whose data it is. A device preference (theme, notification switches) is the
  device's and stays one file. **Anything the signed-in user created or the backend
  answered for them is that account's**, and belongs in §8a instead — one device holds
  several accounts.

---

## 8a. Account-scoped persisted slice

**When:** a persisted store holds user content rather than a device preference —
snaps, movies, upload state.

**Canonical:** [`snap-store.ts`](../../src/entities/snap/model/snap-store.ts) with
[`scoped-store.ts`](../../src/shared/lib/scoped-store/scoped-store.ts), bound by
[`library-scope-gate.tsx`](../../src/_app/providers/library-scope-gate.tsx).

```ts
const StoreName = 'snaply.x';

export const useXStore = create<XState>()(
  persist((set) => ({ items: [], hasHydrated: false, /* … */ }), {
    name: StoreName,
    storage: createJSONStorage(() => localStore),
    onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    // The account owns the data, so nothing is read before one is known.
    skipHydration: true,
  }),
);

// The slice owns *how* to change hands; `_app` owns *when*.
export const applyXScope = createScopedPersistence(useXStore, StoreName, () => ({
  items: [],
  hasHydrated: false,
}));
```

**Rules**
- `skipHydration: true`. A store that loads at import has already loaded the wrong
  account's data by the time anyone knows who is signed in.
- The empty state passed to `createScopedPersistence` must put `hasHydrated` back to
  `false`, so nothing reads the gap between accounts as an empty library.
- Export the `applyXScope` binder from the slice Public API and call it from
  `_app/providers/library-scope-gate.tsx` — the session is a higher layer than the
  entity that holds the data, so the entity may not watch it.
- Never clear a scoped store by hand. Clearing persists, and a hand-rolled clear
  writes the empty state over whichever account's file is currently bound.

---

## 9. Dependency inversion for a swappable external service

**When:** a feature depends on an external service (auth, payment, BaaS) that must be
mockable or replaceable without touching screens.

**Canonical:** [`auth-provider.ts`](../../src/features/sign-in/model/auth-provider.ts)
(interface), [`mock-auth-provider.ts`](../../src/features/sign-in/model/mock-auth-provider.ts) /
[`supabase-auth-provider.ts`](../../src/features/sign-in/model/supabase-auth-provider.ts)
(implementations), selected in [`use-sign-in.ts`](../../src/features/sign-in/model/use-sign-in.ts).

```ts
// model/auth-provider.ts — the seam
export interface AuthProvider {
  signIn(provider: SocialProvider): Promise<User>;
}

// model/use-sign-in.ts — select the concrete impl once, behind a runtime condition
const authProvider: AuthProvider =
  __DEV__ && !isSupabaseConfigured ? mockAuthProvider : supabaseAuthProvider;
```

**Rules**
- Depend on the interface; construct/select the concrete implementation in one place.
- Screens, routing, and stores never learn which implementation is active.

---

## 10. Action orchestration hook

**When:** a user action needs pending/error state and coordinates a service call with a
store write.

**Canonical:** [`use-sign-in.ts`](../../src/features/sign-in/model/use-sign-in.ts).

```ts
export function useDoAction() {
  const commit = useWriteToStore();
  const [pending, setPending] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: Key): Promise<void> {
    if (pending) return;                 // guard re-entry
    setPending(key);
    setError(null);                      // reset on new attempt
    try {
      const result = await service.run(key);
      commit(result);                    // write to store; do NOT navigate here
    } catch (cause) {
      if (!(cause instanceof CancelledError)) setError(ACTION_ERROR_MESSAGE); // silent on cancel
    } finally {
      setPending(null);                  // always clear
    }
  }

  return { run, pending, error };
}
```

**Rules**
- Own `pending`/`error`; guard re-entry; reset error on a new attempt; clear pending in
  `finally`.
- Run the service, then write to the owning store. **Do not navigate** — navigation is
  declarative via the route guard reacting to state.
- Distinguish user-cancellation (silent) from real failure (surface a message).
  User-facing copy is Korean and lives in the feature, not in shared.

---

## 11. Local async resource hook

**When:** loading and mutating a device-local resource (files, media) with reload and
optimistic list updates.

**Canonical:** [`use-local-recordings.ts`](../../src/features/manage-recordings/model/use-local-recordings.ts).

```ts
export function useLocalX() {
  const isMounted = useRef(true);
  const [items, setItems] = useState<X[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    isMounted.current = true;
    void listX()
      .then((next) => { if (isMounted.current) setItems(next); })
      .catch(() => { if (isMounted.current) setErrorMessage('불러오지 못했어요.'); })
      .finally(() => { if (isMounted.current) setIsLoading(false); });
    return () => { isMounted.current = false; };
  }, []);

  const removeX = async (item: X) => {
    try {
      await deleteX(item.uri);
      if (isMounted.current) setItems((cur) => cur.filter((i) => i.id !== item.id)); // optimistic
    } catch {
      if (isMounted.current) setErrorMessage('삭제하지 못했어요.');
    }
  };

  return { items, isLoading, errorMessage, clearError: () => setErrorMessage(undefined), removeX };
}
```

**Rules**
- Guard every post-await `setState` with an `isMounted` ref.
- Expose `isLoading`, per-item progress state where relevant, an `errorMessage` string,
  `clearError`, and the mutating actions.
- Update the list optimistically on success; set a Korean `errorMessage` on failure.
  Keep the file-system/native calls in a shared adapter (§12), not in the hook.
- Keep only the mutations that stay inside this resource. The canonical hook lists and
  saves recording files but no longer deletes them: deleting an original also has to
  reach snap metadata and every movie referencing it, so it became its own
  feature ([`use-delete-snaps.ts`](../../src/features/delete-snap/model/use-delete-snaps.ts))
  that composes both entities. When a mutation spans entities, it outgrew this pattern — the
  caller then reloads the list from the ids that action reports.

---

## 12. Shared adapter vs. feature product-flow split

**When:** using a native/device capability (Location, Notifications, Camera, files).

**Canonical:** raw native in [`shared/lib/location`](../../src/shared/lib/location) vs.
product flow in [`geofence-monitor.ts`](../../src/features/geofence-monitor/model/geofence-monitor.ts);
same split for [`recording-files`](../../src/shared/lib/recording-files),
[`notifications`](../../src/shared/lib/notifications), and
[`haptics`](../../src/shared/lib/haptics) — the last one absorbs the project's iOS-only
guard so no caller repeats `process.env.EXPO_OS === 'ios'`.

```ts
// shared/lib/location — narrow native primitive, no product rules, no copy
export function requestBackgroundLocationPermission(): Promise<PermissionResult> { /* native call */ }

// features/geofence-monitor/model — product flow: ordering, Korean copy, replace-logic
export async function ensureGeofencePermissions(): Promise<LocationPermissionResult> {
  const foreground = await requestForegroundLocationPermission();
  if (!foreground.granted) return { granted: false, reason: 'foreground-denied', /* Korean message */ };
  const background = await requestBackgroundLocationPermission();
  if (!background.granted) return { granted: false, reason: 'background-denied', /* Korean message */ };
  return { granted: true };
}
```

**Rules**
- `shared/lib/*` owns narrow native calls and permission primitives only — no product
  rules, no user-facing copy.
- The feature owns the product flow: permission *ordering* (foreground → background),
  Korean copy, "replace existing monitoring" logic, cooldowns.
- See [state and data](../frameworks/state-and-data.md#securestore-and-device-apis).

---

## 13. Platform variants with an identical export contract

**When:** a module needs a different implementation on web (or iOS/Android).

**Canonical:** `messaging.ts` / `messaging.web.ts`, `local.ts` / `local.web.ts` in
[`shared/lib/notifications`](../../src/shared/lib/notifications); also `recording-files`,
`secure-storage`, and `animated-splash-overlay.tsx` / `.web.tsx`.

```text
shared/lib/notifications/
├── messaging.ts        # native implementation
├── messaging.web.ts    # web implementation — SAME exported names/signatures
├── local.ts
├── local.web.ts
└── index.ts            # re-exports; consumers import only this
```

**Rules**
- Every platform file exports the **same contract**; consumers import the module's
  Public API and let Metro pick `.ios` / `.android` / `.native` / `.web`.
- Never import a platform file directly by extension.

### 13a. Global-scope background task definition

**When:** an OS-driven background task (geofencing, background fetch).

**Canonical:** [`geofence-task.ts`](../../src/features/geofence-monitor/model/geofence-task.ts).

```ts
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const GEOFENCE_TASK_NAME = 'snaply-geofence-monitor'; // shared with startGeofencing

// Module scope (not a component/effect) so the OS can run it on background relaunch.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) { if (__DEV__) console.warn('[geofence] task error:', error.message); return; }
    if (data) await handleGeofenceEvent(data as GeofenceTaskData);
  });
}
```

**Rules**
- Call `TaskManager.defineTask` at **module scope**, guarded by `Platform.OS !== 'web'`.
- Share one stable task-name constant between the definition and `startGeofencing`.
- Client-side cooldowns are in-memory best-effort; treat the backend as authoritative.

---

## 14. Consuming the design system

**When:** any `pages/*/ui` or component that renders.

**Canonical:** [`studio-page.tsx`](../../src/pages/studio/ui/studio-page.tsx); tokens/hooks in
[`shared/ui/theme`](../../src/shared/ui/theme); text via
[`ThemedText`](../../src/shared/ui/themed-text);
[`SnaplyButton`](../../src/shared/ui/snaply-button).

```tsx
import { useScrollToTop } from 'expo-router';
import { useRef } from 'react';

import { Radius, Spacing, useTabBarHeight, useTheme, useTopContentInset } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export function XPage() {
  const theme = useTheme();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();
  // Tab screens only: re-tapping the open tab returns to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ paddingTop: Spacing.six + topInset, paddingBottom: tabBarHeight, gap: Spacing.six }}
    >
      <ThemedText type="title">제목</ThemedText>
      <View style={{ borderRadius: Radius.large, backgroundColor: theme.backgroundElement }} />
    </ScrollView>
  );
}
```

**Rules**
- Read colors from `useTheme()`; use `Spacing`, `Radius`, `Typography`, `MaxContentWidth`
  tokens instead of magic numbers. `useTheme()` resolves the light or dark palette from
  the user's theme mode (system / light / dark) — never import `Colors.dark` directly in
  a screen.
- A screen whose ground is a video surface (the viewfinder) pins its subtree with
  `<ThemeScope scheme="dark">` (see `capture-record-page.tsx`), so chrome stays legible
  over near-black in both theme modes. White glyphs and `rgba` scrims drawn **over
  video** stay literal — they must not follow the theme.
- Render text with `ThemedText` (`type` + `themeColor`) rather than raw `Text`.
- `Typography` owns the size steps and their leading; `ThemedText` variants add only
  weight, letter spacing, and casing on top of a step. Text that cannot be a
  `ThemedText` — a `TextInput`, a glyph drawn over video — still reads its size from
  `Typography` (`Typography.body.fontSize`) rather than a literal.
- The family comes from `Fonts` (`Fonts.sans` is Pretendard GOV, embedded natively;
  `Fonts.mono` is the system monospace for the `edge`/`code` roles). `ThemedText`
  applies it once for every variant, so only text outside `ThemedText` names a family —
  and it names `Fonts.sans`, never a single face like `'PretendardGOV-Bold'`. Pair it
  with `fontWeight` from the four embedded weights **400 / 500 / 700 / 800**; 600 is not
  embedded and resolves down to 500 (see
  [app branding and native config](../workflows/app-branding-and-native-config.md#app-font)).
- **A micro-label picks its role by the script it holds, not by what it means.** `edge`
  and `note` are one tier — both are `Typography.micro` — and differ only in family:
  `edge` is the mono stamp for **Latin and digits** (`REC`, a bare count, `70%`, a
  ticking `12s`), `note` is the Pretendard label for **anything containing Hangul**
  (`스냅 3개`, `7.8초`, `4/6컷 · 2컷 더`). Putting Hangul in an `edge` string does not
  fail loudly; it draws in the OS CJK fallback, which is neither monospaced nor the
  app's voice, and `edge`'s 2dp tracking then wraps the line. When a string switches
  script by branch, switch the role with it
  (`type={remaining > 0 ? 'edge' : 'note'}`) — unless the switch would happen under
  the user's eye, in which case pick `note` for both branches and keep the row stable.
- Respect insets with `useTopContentInset()` / `useTabBarHeight()`.
- **A tab screen's scroll container takes a ref and `useScrollToTop`** (imported from
  `expo-router`, not `@react-navigation/native`). Tab screens stay mounted, so scroll
  position survives a trip to another tab by default and should — re-tapping the tab that
  is already open is what resets it, as on a native tab bar. Do **not** add this to a
  pushed screen: it has no tab to re-tap, and the hook is a no-op there. Do not reset a
  tab's scroll on focus instead; that throws away the position the user was relying on.
- `useTopContentInset()` is for a screen that has nothing above its content — the four
  tab screens. A **pushed** screen (`/movie/[id]`, `/template/[id]`) puts
  [`BackBar`](../../src/shared/ui/back-bar) above its `ScrollView` instead, and the bar
  pads for the status bar itself; calling the hook as well stacks two status-bar heights
  of empty ground under the arrow.
- Leave that bar bare when the screen names itself in its own content. Pass it a `title`
  (and at most one `action`, an icon + its accessibility label) only when the screen has
  no row to spend on a title — a screen whose zones are all fixed, like `/movie/[id]`,
  where the stage lives on the height everything else leaves over. The bar's row is a
  44dp tap target either way, so a title there is free.
- **`hitSlop` does not cross a clipping ancestor on Android.** A small control inside a
  container with `overflow: 'hidden'` — the rounded frames the app draws everywhere — only
  receives touches that land inside that container, however much slop it declares. Spend
  the slop in the directions that stay inside: the removed tray panel's ✕ sat 2dp from
  the top-right corner of a 52dp thumbnail and reached 44dp by growing *down and left* —
  a symmetric slop there measured 34dp in practice (2026-08-12, on device; the component
  is gone but the measurement holds for every clipped corner control). Verify a grown
  target by tapping its far corner on the device — the bounds a
  UI-hierarchy dump reports are the view's, and never include the slop.

---

## 15. Testing patterns

**When:** any function, component, hook, or store. These are the per-module-kind
skeletons; [writing unit tests](../workflows/writing-unit-tests.md) owns what to test,
where a test file lives, and the naming/assertion conventions.

Shared rules across all of §15:
- Co-locate the test next to the unit (`*.test.ts` / `*.test.tsx`).
- When an isolated test must mock another slice, mock its **Public API**
  (`jest.mock('@/entities/session')`), never a deep internal path. Do not treat this as a
  requirement to mock every slice dependency.
- `render` and `renderHook` are asynchronous in RNTL v14 — always `await` them.

### 15a. Pure function (table-driven)

**When:** normalizers, formatters, validators, mappers. No React, no mocks.

**Canonical:** [`capture-options.test.ts`](../../src/entities/capture-session/model/capture-options.test.ts).

```ts
import { normalizeCaptureDuration } from './capture-options';

it.each([undefined, '', '3', '05'])('falls back to three seconds for %s', (value) => {
  expect(normalizeCaptureDuration(value)).toBe(3);
});
```

**Rules**
- Use `it.each` for a family of inputs exercising the same rule, instead of
  copy-pasting near-identical `it` blocks.

### 15b. Component interaction (RNTL)

**When:** a component's consumer-facing contract — role, accessible name, callback wiring.

**Canonical:** [`snaply-button.test.tsx`](../../src/shared/ui/snaply-button/snaply-button.test.tsx).

```tsx
const onPress = jest.fn();
await render(<SnaplyButton title={title} onPress={onPress} />);
fireEvent.press(screen.getByRole('button', { name: title }));
expect(onPress).toHaveBeenCalledTimes(1);
```

**Rules**
- Query by accessibility role and name (`screen.getByRole('button', { name })`).
- Assert behavior, not styling — style values are verified on-device.

### 15c. Hook test with an explicit boundary

**When:** any `use-*` hook. Choose the boundary based on the risk being protected. A
small action hook can isolate another slice at its Public API. A hook whose value is its
composition of React Query, stores, query factories, and internal utilities should run those
real implementations and mock only HTTP/native/third-party boundaries.

**Canonical:** [`use-sign-in.test.ts`](../../src/features/sign-in/model/use-sign-in.test.ts)
(action hook), [`use-local-recordings.test.ts`](../../src/features/manage-recordings/model/use-local-recordings.test.ts)
(async resource hook with loading state),
[`use-geofence-monitoring.test.ts`](../../src/features/geofence-monitor/model/use-geofence-monitoring.test.ts)
(real `QueryClient`, query factory, permission flow, and region selection with native calls mocked).

```ts
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockCommit = jest.fn();
jest.mock('@/entities/session', () => ({ useSetSession: () => mockCommit })); // mock at the Public API

describe('useDoAction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('commits on success', async () => {
    const { result } = await renderHook(() => useDoAction());
    await act(async () => { await result.current.run('key'); });
    expect(mockCommit).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('stays silent on cancel', async () => { /* reject with CancelledError → no commit, no error */ });
  it('surfaces an error on failure', async () => { /* reject with Error → error set */ });
});
```

For a hook that loads on mount, wait for the asynchronous transition before asserting:

```ts
const { result } = await renderHook(() => useLocalRecordings());
await waitFor(() => expect(result.current.isLoading).toBe(false));
```

**Rules**
- Wrap state updates in `await act(async …)`; wait for async transitions with `waitFor`.
- Test the observable contract across branches — for an action hook: success, cancel
  (silent), failure (error surfaced).
- Prefer a real `QueryClient` and provider to mocking `useQueryClient`, `useQuery`, or
  `useMutation`. Set `gcTime: Infinity`, disable retries, and seed cache data when the test
  must not perform HTTP.
- Use real internal utilities and error classes. In particular, never create a simplified
  stand-in for `ApiError`; constructor and `instanceof` behavior are part of the contract.
- Add an integration-style case when several isolated mocks could agree with one another while
  the actual modules are disconnected.

### 15d. Zustand store

**When:** a store is a module-level singleton — exercise it through its exported hooks,
and mock the persistence backend so no native storage is touched.

**Canonical:** [`snap-store.test.ts`](../../src/entities/snap/model/snap-store.test.ts).

```ts
jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
```

Mock whichever backend the store persists through — `local-store` for the growing
clip/roll data, `secure-storage` for small preference stores.

**Rules**
- Drive the store through `renderHook` + `act` on its exported hooks.
- Reset the store to its default in `beforeEach`/`afterEach` so ordering never matters.
  A store exported for its co-located test only (`useClipStore`) is reset directly with
  `setState`; nothing outside the slice may import it.

### 15e. Mocking native modules and `react-native`

**When:** the `jest-expo` preset does not cover a module, or a test must control return
values.

**Canonical:** [`use-theme.test.tsx`](../../src/shared/ui/theme/use-theme.test.tsx)
(minimal `react-native` factory);
[`recording-files.test.ts`](../../src/shared/lib/recording-files/recording-files.test.ts)
(class-based API — real mock classes so `instanceof` still works, backed by a shared
in-memory registry each test seeds).

```ts
// Never jest.requireActual('react-native') — under jest-expo it eagerly loads the full
// RN index and trips native TurboModule invariants. List only what the test touches:
jest.mock('react-native', () => ({
  useColorScheme: jest.fn(),
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));
```

**Rules**
- Prefer mocking another slice's Public API over reaching for its internal native module.
- Keep the manual factory minimal — only the exports the module graph under test uses.

---

## 16. Form with schema validation

**When:** any form. React Hook Form owns the field state, a Zod schema in the owning
slice's `model` owns the rules, and the action hook owns the request.

**Canonical:** [`email-sign-in-form.tsx`](../../src/features/sign-in/ui/email-sign-in-form.tsx)
+ [`email-sign-in-schema.ts`](../../src/features/sign-in/model/email-sign-in-schema.ts).

```ts
// features/<action>/model/<action>-schema.ts — rules + product copy, no React
export const signUpSchema = z
  .object({
    // Reuse the shared primitive; do not restate the rule with z.string().email().
    email: z.string().refine(isValidEmail, '올바른 이메일 주소를 입력해 주세요.'),
    password: z.string().refine(isValidPassword, `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`),
    confirm: z.string(),
  })
  // A whole-object rule needs an explicit `path`, or the message attaches to the
  // form instead of the field the user has to fix.
  .refine((values) => values.confirm === values.password, {
    message: '비밀번호가 일치하지 않아요.',
    path: ['confirm'],
  });

export type SignUpValues = z.infer<typeof signUpSchema>;
```

```tsx
// features/<action>/ui/<action>-form.tsx
const { signIn, isPending, error } = useEmailSignIn();   // request state lives here
const { control, handleSubmit } = useForm<EmailSignInValues>({
  resolver: zodResolver(emailSignInSchema),
  defaultValues: { email: '', password: '' },            // never leave a field undefined
});

const submit = handleSubmit((values) => signIn(values.email, values.password));

<FormTextField control={control} name="email" label="이메일" editable={!isPending} />
<SnaplyButton title={isPending ? '로그인 중…' : '로그인'} disabled={isPending}
              onPress={() => void submit()} />
```

**Rules**
- Bind inputs with [`FormTextField`](../../src/shared/ui/form-text-field); never hand a
  raw `TextField` a `field` object at the call site. RN inputs are controlled, so an
  uncontrolled/`register` approach does not apply.
- Always pass `defaultValues`. A missing key makes the input uncontrolled on first
  render and RHF warns.
- `handleSubmit` returns a promise-returning function: call it as
  `onPress={() => void submit()}` rather than passing it directly, so the press event
  is not mistaken for a form event.
- Read `isPending` from the action hook, not `formState.isSubmitting` — one source of
  truth for a request in flight.
- Do not forward `field.ref`. It serves focus management no screen here uses, and
  reading it during render trips the `react-hooks/refs` lint rule.

### 16a. Testing an async-validated form

`zodResolver` validates asynchronously, so an interaction that is not awaited inside
`act` resolves *after* the test — leaking a state update that makes the **next** test in
the file render nothing. The failure looks like an unrelated
"Unable to find an element with role: button" two tests later.

**Canonical:** [`email-sign-in-form.test.tsx`](../../src/features/sign-in/ui/email-sign-in-form.test.tsx).

```ts
async function press(name: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}
```

**Rules**
- Wrap every `fireEvent` that can trigger validation in `await act(async () => …)`.
- Keep rule coverage in the schema's own table-driven test ([§15a](#15a-pure-function-table-driven));
  the component test proves wiring — typing reaches state, the error reaches the right
  input, a valid submit reaches the action hook.

---

## Cross-cutting principles these patterns share

1. **One reason to change per file** — transport ≠ mapping ≠ query key ≠ product flow.
2. **Cross boundaries only through Public APIs** — named exports in `index.ts`, no
   `export *`, no deep imports.
3. **Every stopgap documents its replacement** — mock routing, local persistence, and
   in-memory cooldowns all comment how the real backend supersedes them.
4. **User-facing copy (Korean) lives in features/pages; raw native lives in shared.**

## Sources

- [Feature-Sliced Design](../architecture/feature-sliced-design.md)
- [Module boundaries](./module-boundaries.md)
- [State and data placement](../frameworks/state-and-data.md)
- [SOLID for React Native](./solid-react-native.md)
- [Feature development workflow](../workflows/feature-development.md)
