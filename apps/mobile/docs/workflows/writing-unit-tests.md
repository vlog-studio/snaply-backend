# Writing unit tests

This document defines how to author automated tests in this project. For the commands that run the suite on CI and locally, and for the boundary between JavaScript tests and on-device verification, read [`local-development-and-testing.md`](local-development-and-testing.md). This document covers what to test, where a test file lives, and the authoring conventions; the per-module-kind skeletons live in the [implementation cookbook §15](../conventions/cookbook.md#15-testing-patterns).

## Tooling

- **Runner:** [`jest`](https://jestjs.io) with the [`jest-expo`](https://docs.expo.dev/develop/unit-testing/) preset (configured in [`jest.config.js`](../../jest.config.js)). The preset provides the React Native transform and mocks for most Expo native modules. [`jest.setup.js`](../../jest.setup.js) runs before each suite; it materializes Expo's lazy `fetch` global so its native-logger warning cannot fire during a later suite's teardown and fail `test:ci`. Leave it in place. The config also sets `resolver: 'react-native-worklets/jest/resolver.js'`, without which importing `react-native-reanimated` from any tested module fails the whole suite (`Cannot read properties of undefined (reading 'loadUnpackers')`) — Reanimated 4 runs its real JS under Jest and its `react-native-worklets` dependency must resolve to the non-`.native` modules. Leave that in place too; it is what lets components with animations be rendered in tests at all.
- **Rendering and interaction:** [`@testing-library/react-native`](https://callstack.github.io/react-native-testing-library/) (RNTL) v14 — `render`, `screen`, `fireEvent`, `renderHook`, `act`, and `waitFor`. **`render` and `renderHook` are asynchronous in v14 — always `await` them**, or `result` is a pending promise and `result.current` reads as `undefined`.
- **Path alias:** `@/…` resolves to `src/…` (and `@/assets/…` to `assets/…`) in tests via `moduleNameMapper`, so tests use the same import specifiers as production code.
- **TypeScript:** every test is a `.ts`/`.tsx` file and must pass `npm run typecheck`. Jest globals are available because `tsconfig.json` includes `"jest"` in `types`.

## What to test

Prioritize modules that hold decision logic or a user-facing contract. In rough priority order:

1. **Pure functions** — normalizers, formatters, validators, and mappers (for example `entities/capture-session/model/capture-options.ts`, `shared/lib/datetime/datetime.ts`). They are cheap to exercise, but add cases only when they protect a rule or meaningful edge case.
2. **Data-safety and adapter logic** — code that filters, sorts, or guards side effects (for example the "only Snaply recordings can be deleted" guard in `shared/lib/recording-files`). Test the branch logic even when the underlying native API must be mocked.
3. **Hooks and stores** — state machines, optimistic updates, and the exact user-facing messages they surface (for example `features/manage-recordings/model/use-local-recordings.ts`, `entities/snap/model/snap-store.ts`).
4. **Component interaction contracts** — the accessibility role, the rendered label, and the callback wiring that a consumer depends on (for example `shared/ui/snaply-button`). Assert behavior, not styling.

The goal is regression protection, not test count or line coverage. Before adding a test,
state the product behavior that would regress if it failed. A useful failure should tell the
reader which rule, transition, user action, or external contract broke. Do not add a case only
to execute an uncovered line.

High-value tests usually protect at least one of these:

- A business rule, validation decision, permission rule, or state transition.
- A previously reported bug, including the edge condition that caused it.
- A meaningful user interaction and its outcome, not merely the presence of a label.
- Error handling, cancellation, duplicate-submit prevention, query invalidation, or an async race.
- Serialization and validation at an HTTP, WebSocket, native, browser, or third-party boundary.

Tests that only prove a component renders, one static string exists, a wrapper forwards props,
or a library behaves as documented are normally not worth adding. Snapshot tests require a
specific reviewed contract that the snapshot protects; a snapshot is never the only assertion.

Do **not** write JavaScript tests for:

- Styling values, layout numbers, or theme color hex codes — these are verified visually on the iOS Simulator and Android emulator.
- Native behavior: camera, permissions, real file-system access, animation timing, haptics, media playback. These require on-device verification (see [`local-development-and-testing.md`](local-development-and-testing.md)); a passing mock-based test does not prove them.
- Route files under `src/app` and thin `index.ts` Public API barrels, which contain no logic of their own. Test the slice modules they re-export instead.

## Mocking policy

Mock the narrowest external boundary that makes the scenario deterministic: HTTP transport,
WebSocket, secure storage, clock, filesystem, device permissions, native APIs, or a third-party
service. Use the real product code on the application side of that boundary whenever practical.

- Do not mock a pure internal utility, custom hook, Zustand store, React Query, or router merely
  because it is convenient. Use the real utility, a real `QueryClient`/provider, memory-backed
  storage, or a memory router when the flow under test depends on their composition.
- An isolated unit test may mock another slice through that slice's Public API. Critical flows
  that span slices also need at least one integration-style test with the real internal stores,
  query factories, and adapters so matching mocks cannot hide a broken connection.
- Never recreate an internal error class or domain type in a mock. Import the real class so
  `instanceof`, constructor arguments, error codes, and status handling stay aligned with
  production.
- A mock must model the real boundary contract, including rejection, cancellation, cleanup, and
  payload shape where those affect behavior. A mock that cannot occur in the application is not
  evidence about the application.
- Count internal mocks as a maintenance cost. If a test needs several of them, reconsider the
  test boundary before adding another.

## Where a test lives

Co-locate every test with the module it verifies, inside the same FSD segment, using the `.test.ts`/`.test.tsx` suffix:

```text
src/shared/lib/datetime/datetime.ts
src/shared/lib/datetime/datetime.test.ts
```

Co-location keeps FSD ownership explicit and lets a slice move as one unit. A test imports the module under test through a **relative path** (`./datetime`), exactly as sibling files inside the slice do. It imports anything from another slice through that slice's `@/…` Public API, never a deep path — the module-boundary rules in [`module-boundaries.md`](../conventions/module-boundaries.md) apply to test files too. Do not add a test to the slice's `index.ts` barrel.

## Conventions

- **Describe the module, name the behavior.** The top-level `describe` names the unit (`describe('useLocalRecordings', …)`); each `it` states an observable behavior in plain language (`it('prepends a saved recording and returns it', …)`).
- **Assert behavior, not implementation.** Query by role and accessible name (`screen.getByRole('button', { name })`); check returned values and rendered output rather than internal calls, except when the side effect *is* the contract (a delete call, an analytics event).
- **Prefer refactor-resistant assertions.** Do not assert hook internals, private state, exact DOM/view nesting, class names, or incidental callback order. A behavior-preserving refactor should keep the test green.
- **Write regression tests with bug fixes.** When feasible, reproduce the bug with a failing test first, then make the smallest behavior change that turns it green.
- **Protect async boundaries explicitly.** For mutations and long-lived effects, consider duplicate invocation, cancellation/unmount, stale responses, cleanup, and cache invalidation instead of testing only the successful first request.
- **Table-driven cases.** Use `it.each` for a family of inputs that exercise the same rule (supported vs. fallback values, each variant of an enum). This is the established style — follow it instead of copy-pasting near-identical `it` blocks.
- **Korean strings as escapes.** Assertions against Korean user-facing copy are written with `\uXXXX` escape sequences so the source stays ASCII-only and diffs stay stable. Match the existing tests:

  ```ts
  const buttonTitle = '촬영 시작'; // 촬영 시작
  ```

  Prefer asserting a message the module owns over re-typing long strings; when a literal is unavoidable, escape it.
- **Reset shared state.** Call `jest.clearAllMocks()` in `beforeEach`, and reset module-level singletons (Zustand stores, in-memory registries) between tests so ordering never matters.

## Patterns by module kind

The copy-followable skeleton for each module kind lives in the
[implementation cookbook §15](../conventions/cookbook.md#15-testing-patterns):

- **Pure functions** — input/output assertions with `it.each`, no React, no mocks:
  [cookbook §15a](../conventions/cookbook.md#15a-pure-function-table-driven).
- **Components (RNTL)** — render, drive with `fireEvent`, query by accessibility role
  and name: [cookbook §15b](../conventions/cookbook.md#15b-component-interaction-rntl).
- **Hooks** — `await renderHook`, `act`/`waitFor`, and an explicit isolation boundary:
  [cookbook §15c](../conventions/cookbook.md#15c-hook-test-with-an-explicit-boundary).
- **Zustand stores** — exercise through exported hooks, mock the persistence backend,
  reset in `afterEach`: [cookbook §15d](../conventions/cookbook.md#15d-zustand-store).
- **Forms** — cover the rules in the schema's own table-driven test, and the wiring in a
  component test whose every interaction is awaited inside `act` (async validation that
  escapes a test breaks the *next* one):
  [cookbook §16a](../conventions/cookbook.md#16a-testing-an-async-validated-form).
- **Expo and native modules** — the `jest-expo` preset mocks most Expo modules already;
  add a `jest.mock` factory only when a test needs to control return values or the
  module exposes a class-based API the preset does not cover. Minimal `react-native`
  factory and class-based mock guidance:
  [cookbook §15e](../conventions/cookbook.md#15e-mocking-native-modules-and-react-native).

## Before you finish

Run the canonical automated gate and confirm it passes:

```bash
npm run verify
```

Its check list is defined once, in `package.json`. While iterating, `npm test` runs the suite in watch mode and `npm run test:ci` runs it once without the other gates. A new user-visible behavior is not complete until it is covered by a test at the appropriate level and the affected document under `docs/features` is updated in the same change (see [`feature-development.md`](feature-development.md)).
