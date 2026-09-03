# Agent documentation index

This file is an index of task-specific documentation, not the full body of the project rules. Before making changes, read the applicable documents from the table below. If a task spans multiple categories, apply all relevant documents.

Paths in this file and the linked documents are relative to `apps/mobile` unless stated otherwise.
Commands may be run from that directory, but agents working from the monorepo root should prefer the
root workspace aliases (`npm run verify:mobile`, documented below, and `npm run dev:mobile` for Metro).
Where `apps/mobile/package.json` defines a script for an action (`npm run android:device`, `npm run ios`, …),
docs and agents use that script rather than the raw `npx expo run:*` command it wraps; from the monorepo
root the same script is invoked as `npm run <script> -w snaply-app`.

The **Read** column says how much of a required document the task actually needs — "required" binds you to its rules, not to reading every line:

- **Whole** — short and rule-dense; read it fully before the change.
- **Sections** — open it and read the sections covering what you touch; never end-to-end.
- **Route** — start at the listed index and read only the documents or sections it routes you to for this task.

| Task category | Required document | Read | Scope |
| --- | --- | --- | --- |
| Any change to code under `src` | [`docs/architecture/feature-sliced-design.md`](docs/architecture/feature-sliced-design.md) | Sections | FSD v2.1 layers, slices, segments, dependency principles, and the project-standard structure |
| Imports, exports, and new modules or slices | [`docs/conventions/module-boundaries.md`](docs/conventions/module-boundaries.md) | Whole | Public APIs, import direction, circular dependencies, and naming rules |
| Expo Router, layouts, navigation, providers, and platform variants | [`docs/frameworks/expo-router.md`](docs/frameworks/expo-router.md) | Whole | Integration rules for Expo SDK 57 and FSD |
| APIs, TanStack Query, Zustand, forms, and persistent storage | [`docs/frameworks/state-and-data.md`](docs/frameworks/state-and-data.md) | Whole | Placement rules for state and data code |
| Animations, transitions, and gesture-driven interactions (Reanimated / Gesture Handler) | [`docs/frameworks/animations-and-gestures.md`](docs/frameworks/animations-and-gestures.md) | Sections | Canonical motion/gesture implementations, UI-thread rules, reduced motion, remount-blink and React Compiler pitfalls, motion values |
| Integrating a backend that publishes an OpenAPI/Swagger spec | [`docs/workflows/openapi-api-integration.md`](docs/workflows/openapi-api-integration.md) | Sections | Type-only codegen approach, tooling, layered data flow, and setup procedure for the API layer |
| New features, refactoring, and code review | [`docs/workflows/feature-development.md`](docs/workflows/feature-development.md) | Whole | Classification order, implementation workflow, and completion checklist |
| Running, testing, or verifying changes on a device or simulator | [`docs/workflows/local-development-and-testing.md`](docs/workflows/local-development-and-testing.md) | Sections | macOS environment constraints; iOS Simulator via Expo Go, Android via dev build (Expo Go no longer boots this app on Android), and EAS Build |
| Verifying a change on the physical Android device (the default verification surface) | [`docs/workflows/android-device-verification.md`](docs/workflows/android-device-verification.md) | Sections | Wireless-adb toolkit: screenshots, UI hierarchy, input injection, app-private state, logs, permissions, and the limits of each |
| Writing or updating Jest unit tests | [`docs/workflows/writing-unit-tests.md`](docs/workflows/writing-unit-tests.md) | Whole | What to test, where a test file lives, and the authoring conventions; the per-module-kind skeletons live in the cookbook |
| App icon, display name, splash screen, adaptive-icon colors, or other native-baked branding | [`docs/workflows/app-branding-and-native-config.md`](docs/workflows/app-branding-and-native-config.md) | Sections | CNG source-of-truth model, prebuild + rebuild procedure, per-platform verification, and known pitfalls |
| Any user-visible feature addition, behavior change, removal, or implementation-status change | [`docs/features/README.md`](docs/features/README.md) and the affected feature document(s) | Route | Current product behavior, routes, ownership, platform support, limitations, and documentation maintenance rules. Read the README's index and maintenance contract plus the affected feature document(s) — not all twelve |
| Designing or reviewing components, hooks, modules, services, and dependency boundaries | [`docs/conventions/solid-react-native.md`](docs/conventions/solid-react-native.md) | Sections | Practical SOLID principles for React Native, evidence-based abstractions, and implementation safeguards |
| Implementing a route, data fetch/mutation, store, hook, native adapter, or test — before writing a new slice | [`docs/conventions/cookbook.md`](docs/conventions/cookbook.md) | Sections | Cookbook of the canonical, copy-followable implementation patterns already in the codebase, each pointing to the reference file to imitate; the single home for copyable skeletons. Read the recipe for the module kind you are writing — never end-to-end (1,000+ lines) |
| Reviewing, critiquing, or improving a screen's UX; any change to screen structure, information hierarchy, CTAs, or user-facing copy | [`docs/ux/README.md`](docs/ux/README.md) and the documents it indexes | Route | The UX decision system: philosophy, principles with detection rules, UX smell catalog, screen-analysis framework, interaction patterns, UX writing, agent review protocol, guardrails, and the review checklist. The README routes by task depth — a copy tweak needs `ux-writing.md` and the review checklist, not the whole twelve-document system |

## Planned documentation

Documents that a task category needs but that do not exist yet. Do not link them from the table above until they are written, and do not improvise their content in the meantime — follow the stated fallback and say so when reporting results.

| Missing document | Blocked on | Fallback until then |
| --- | --- | --- |
| `docs/workflows/ios-device-verification.md` — verifying a change on a physical iOS device | The owner has no iOS device (as of 2026-07-27) | Use the iOS Simulator procedures in [`docs/workflows/local-development-and-testing.md`](docs/workflows/local-development-and-testing.md), and state explicitly that a change was not verified on iOS hardware |

## Documentation language

Classify a document by its primary audience before creating or editing it:

- Agent documentation must be written in English. This includes `AGENTS.md` and the documents under `docs/architecture`, `docs/conventions`, `docs/frameworks`, `docs/workflows`, `docs/features`, and `docs/ux` that this index routes agents to. Korean
  user-facing product strings quoted inside those documents stay in Korean, since they are the product's own copy.
- Human-developer documentation must be written in Korean. This includes the root `README.md` and every guide under `docs/guides/`.
- Link human-developer guides from `README.md`, not from the agent task index above. Do not add `docs/guides/` documents to that index.
- When a change invalidates either kind of documentation, update it in the language assigned to its audience.

Preserve code identifiers, commands, API names, product names, and other technical terms when translating them would reduce precision.

## Verification

- Run `npm run verify:mobile` from the monorepo root, or `npm run verify` from `apps/mobile`, before finishing any code change. Both invoke the same canonical gate; its check list is defined once in `apps/mobile/package.json`, and CI runs the workspace command.
- A `verify` failure that pre-exists your change and is unrelated to it: report it with evidence instead of expanding your scope to fix it.
- On-device and platform verification is separate and stays governed by the workflow documents in the table above.

## Rule precedence

1. The user's current request
2. The repository constitution and product specs at the monorepo root —
   [`docs/constitution.md`](../../docs/constitution.md) and [`docs/specs/`](../../docs/specs/README.md).
   They bind mobile work too; the documents below are workspace-level detail under them
3. Project documentation linked from this index
4. Official, version-specific documentation
5. General framework conventions

If documentation and implementation diverge, do not spread an undocumented exception. Update the relevant documentation with the implementation or report the discrepancy.

## Feature documentation maintenance

Treat feature documentation as part of the feature implementation, not as optional follow-up work. Whenever a change adds, modifies, removes, or completes user-visible behavior, update the affected document under `docs/features` in the same change. Keep its routes, behavior, ownership map, platform support, persistence, implementation status, and known limitations consistent with the code. Add a new feature document and link it from `docs/features/README.md` when no existing document owns the behavior.

When the change alters the **behavior contract** — user-visible behavior or a policy value — also update the matching requirement in the monorepo root [`docs/specs/`](../../docs/specs/README.md), in the same change and before (or alongside) the implementation (constitution art. 1 and 3). Feature documents record what the app *does*; the specs own what it *must do*.

## External sources of truth

- Before writing Expo code, read the relevant API page in the [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/). Do not rely on the latest-version documentation or memory.
- Base FSD decisions on the [official Feature-Sliced Design v2.1 documentation](https://feature-sliced.design/docs/get-started/overview). Do not apply older material that uses the deprecated `processes` layer.
