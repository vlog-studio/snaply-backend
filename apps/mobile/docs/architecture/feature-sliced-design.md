# Feature-Sliced Design project standard

## Purpose and source of truth

This document defines the Feature-Sliced Design (FSD) standard for the Snaply React Native app. It is based on the [official FSD v2.1 documentation](https://feature-sliced.design/docs/get-started/overview) as of 2026-07-15, with web and React examples adapted to an Expo Router-based React Native project.

FSD is a dependency model, not merely a folder template. Its goals are to:

- Make code discoverable through product language.
- Limit the impact of changes through layers and slice boundaries.
- Base reuse on actual scope rather than speculation.
- Separate externally visible contracts from internal implementation through Public APIs.

## Project-standard structure

Create only layers that provide current value. Do not pre-create empty directories.

```text
src/
├── app/                 # Expo Router route adapter only; not an FSD layer
│   ├── _layout.tsx
│   ├── index.tsx
│   └── ...
├── _app/                # FSD App layer
│   ├── providers/
│   ├── routes/
│   └── styles/
├── pages/               # Screen-level slices
│   └── <page>/
│       ├── ui/
│       ├── api/
│       ├── model/
│       └── index.ts
├── widgets/             # Large independent UI or use-case blocks
├── features/            # Reused user actions
├── entities/            # Business concepts used by the product
└── shared/              # Business-agnostic foundation
    ├── api/
    ├── ui/
    ├── lib/
    ├── config/
    ├── routes/
    └── assets/
```

`src/app` and `src/_app` are separate because Expo Router interprets ordinary files under `src/app` as routes. Keep only routes and Router-special files such as `_layout.tsx` under `src/app`. Put providers and global initialization in `_app`, and screen implementations in `pages`. See [Expo Router integration](../frameworks/expo-router.md) for details.

## Layers and responsibilities

Dependencies flow downward only.

```text
route adapter (src/app)
        ↓
_app → pages → widgets → features → entities → shared
```

`src/app` is a framework adapter and owns no application logic. FSD layers must never import from `src/app`.

### `_app`: application composition and global concerns

This layer runs and composes the whole application.

- Top-level providers such as React Query, theme, and error boundaries
- Splash behavior, app startup, and global lifecycle handling
- Root navigation layouts and app-wide routing policies
- Global styles, analytics, and logging initialization
- Store setup only when coordination truly spans the entire app

Like `shared`, `_app` has no business slices and is divided directly into segments. Use structures such as `_app/providers` and `_app/routes`. Do not create a business slice such as `_app/auth`.

### `pages`: screens

A page represents a screen rendered by an Expo Router route, or a group of closely related screens.

- Screen UI and screen-specific loading, error, and empty states
- Composition logic and small local state used only by that screen
- Data requests or mutations used only by that screen
- Composition of lower-layer widgets, features, and entities

Do not extract a large screen block into a widget merely because it is large. If it is used once, keep it in the page and split it into internal components only when that improves readability.

### `widgets`: large independent blocks

Widgets are large UI or use-case blocks that are reused across multiple screens or can be understood independently inside one screen.

Examples include a global app header, a reused photo feed, or a media gallery used on multiple screens. If a block makes up most of one page and is not reused, keep it in that page.

### `features`: user actions

Features represent deliberate, product-valued actions that users perform and that are reused across screens or widgets.

Possible examples include `capture-photo`, `share-photo`, `sign-in`, and `toggle-favorite`. Prefer names that make the action visible.

Not every interaction is a feature. Consider all of the following:

- Does the user recognize it as a product-valued action?
- Is it reused by more than one page or widget, or does it have an independent reason to change?
- Would a separate slice make the codebase easier for a new developer to navigate?

A button and its handler used on one screen belong in that page by default.

### `entities`: business concepts

Entities are persistent noun-like concepts the product works with.

Possible examples include `photo`, `album`, `user`, and `notification`. Create them only after the product model is established; do not create an entity for every API response DTO.

An entity slice may own:

- Domain types, schemas, transformations, and calculations in `model`
- Entity queries and query options in `api`
- Small visual representations reused by higher layers in `ui`

Entity slices must not import one another by default. Compose relationships in a feature, widget, or page. Use an `@x` Public API only for unavoidable type-level relationships and keep it minimal.

### `shared`: foundational code

Shared code can be explained without knowing a specific product use case.

- `api`: HTTP clients, common error handling, and external-service adapters
- `ui`: UI kit without business logic
- `lib`: focused independent libraries for concerns such as dates, colors, or storage
- `config`: environment variables, app-wide configuration, and global feature flags
- `routes`: href builders for targets more than one screen navigates to
- `assets`: runtime assets reused across slices

`shared` is not a dumping ground for `utils`, `helpers`, `types`, `components`, or `hooks`. Use focused responsibilities such as `shared/lib/date` or `shared/lib/secure-storage`.

## Slices and segments

### Slice

A slice is a product-meaningful unit directly under `pages`, `widgets`, `features`, or `entities`. Slices on the same layer must remain independent.

```text
features/
├── capture-photo/
└── share-photo/
```

`capture-photo` must not import `share-photo`. Compose them in a widget or page, or move a genuinely shared domain concept down to an entity or shared module.

Use a slice group only when the number of slices makes navigation difficult. A group is a navigation-only folder: it has no `index.ts`, segments, or shared code of its own.

### Segment

A segment groups files within a slice by technical purpose.

| Segment | Contents |
| --- | --- |
| `ui` | React Native components, display formatters, and styles |
| `api` | Request functions, query or mutation options, DTOs, and mappers |
| `model` | Domain types, schemas, state, and business rules |
| `lib` | Supporting logic used only inside the slice |
| `config` | Slice-specific flags and configuration |

Do not create every segment in every slice. A slice may contain one segment and an `index.ts`. Do not use `components`, `hooks`, `types`, or `utils` as segment names because they describe what files are rather than what they are for.

## Placement algorithm

Place new code at the highest location matching its actual scope, using this sequence:

1. Must Expo Router discover it as a route declaration? Keep only a thin adapter under `src/app`.
2. Is it application startup or global composition? Put it in `_app`.
3. Is it used by one screen? Put it in that `pages/<page>` slice.
4. Is it a large independent UI block reused across screens? Put it in `widgets`.
5. Is it a user action reused in multiple places? Put it in `features`.
6. Is it a business noun and rule shared by multiple actions? Put it in `entities`.
7. Is it business-agnostic foundational code? Put it in `shared`.

Do not move code to a lower layer because it might be reused later. Start in the page and extract when a second real consumer appears.

### Starter files reintroduced by an upgrade

The starter's technical directories — `src/components`, `src/hooks`, `src/constants` — were dissolved into this structure on 2026-07-15 and removed. They are not allowed paths. If an Expo upgrade or a template regenerates files there, classify each file individually with the algorithm above instead of restoring the directory: generic UI without business logic goes to `shared/ui`, a single screen's block stays in that page, and navigation composition goes to `_app/routes`.

## Important differences in the current FSD version

- The `processes` layer is deprecated in v2.1. Put route orchestration for multi-screen flows in `_app`, product actions in features, and screen-specific composition in pages.
- App and Shared contain no slices. Do not create `_app/auth` as an auth slice; organize App by responsibilities such as `_app/providers` and `_app/routes`.
- Features are not the default location for all functionality. Use them selectively for reused user actions.
- A page containing substantial code is not itself a violation. Keep code in the page when it is clear and screen-specific.
- A Public API is not an indiscriminate barrel export. Explicitly expose only the contract needed by consumers.
- Imports between same-layer slices are forbidden. A slice group does not alter this rule.

## Sources

- [FSD Overview](https://feature-sliced.design/docs/get-started/overview)
- [Layers](https://feature-sliced.design/docs/reference/layers)
- [Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- [Slice groups](https://feature-sliced.design/docs/reference/slice-groups)
- [Public API](https://feature-sliced.design/docs/reference/public-api)
