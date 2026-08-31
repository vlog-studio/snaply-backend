# Module boundaries and import rules

## Core rules

FSD import rules take precedence over folder appearance.

```text
_app → pages → widgets → features → entities → shared
```

- Import only from layers below the current layer.
- Within the same layer, import only from the same slice.
- A `src/app` route adapter may import only from the Public API of `_app` or `pages`.
- FSD layers must not import from `src/app`.
- Consumers outside a slice must use the slice-root Public API.
- Files inside the same slice use relative imports to concrete files.

## Allowed and forbidden examples

```ts
// pages/photo-detail/ui/photo-detail-page.tsx
// ✅ Public APIs of slices on lower layers
import { PhotoCard } from '@/entities/photo';
import { SharePhotoButton } from '@/features/share-photo';

// ✅ Concrete relative path inside the same slice
import { usePhotoDetail } from '../model/use-photo-detail';

// ❌ A feature importing the higher Pages layer
import { PhotoDetailPage } from '@/pages/photo-detail';

// ❌ A feature importing another slice on the Features layer
import { CapturePhotoButton } from '@/features/capture-photo';

// ❌ A deep import into another slice's internals
import { PhotoCard } from '@/entities/photo/ui/photo-card';
```

## Public APIs

Each slice under `pages`, `widgets`, `features`, and `entities` has an `index.ts` at its root.

```text
entities/photo/
├── api/
├── model/
├── ui/
└── index.ts
```

Explicitly export only the minimum contract an external consumer needs.

```ts
// entities/photo/index.ts
export { PhotoCard } from './ui/photo-card';
export { photoQueries } from './api/photo.queries';
export type { Photo } from './model/photo';
```

Do not use the following pattern:

```ts
// ❌ Accidentally exposes internals and obscures the intended contract.
export * from './ui/photo-card';
export * from './model/photo';
```

**A type that appears in an exported value's signature is part of the contract, even when no consumer imports it by name.** Props types, option objects, and domain models reach consumers through inference, so a dead-export scan will report them as unused — that report is not actionable. Do not prune a type for that reason alone; prune it when the value it describes is gone.

The inverse *is* actionable: a value or type that no external consumer uses **and** that only its own module reads has no place in `index.ts`, and the `export` keyword on it inside the module is noise. Keep the declaration module-private instead.

### Do not import a slice's own Public API from inside that slice

If `index.ts` re-exports an internal file and that file imports `index.ts`, the slice creates a circular dependency.

```ts
// entities/photo/ui/photo-card.tsx
// ✅ Concrete file in the same slice
import type { Photo } from '../model/photo';

// ❌ Routes back through the slice's own barrel
import type { Photo } from '..';
```

### Public APIs in Shared

`shared/ui` and `shared/lib` can contain many unrelated modules, so do not create one large barrel for either segment. Give each module its own Public API.

```text
shared/ui/button/index.ts
shared/ui/text-field/index.ts
shared/lib/date/index.ts
shared/lib/secure-storage/index.ts
```

```ts
import { Button } from '@/shared/ui/button';
import { formatDate } from '@/shared/lib/date';
```

Because `_app` and `shared` have no FSD slices, each segment or independent module inside a segment acts as a Public API boundary.

## Entity cross-reference exception: `@x`

Use an `@x` API only when an entity relationship cannot be composed on a higher layer and a direct type-level reference is intrinsic to the model.

```text
entities/photo/
├── @x/
│   └── album.ts
└── index.ts
```

```ts
// entities/photo/@x/album.ts
export type { Photo } from '../model/photo';

// entities/album/model/album.ts
import type { Photo } from '@/entities/photo/@x/album';
```

- Allow `@x` only on the Entities layer.
- Use a separate file per target entity so the relationship is explicit.
- Do not use it for runtime cross-imports of convenience.

## Platform-specific modules

React Native and Expo platform extensions are implementation variants of the same FSD module.

```text
shared/ui/date-picker/
├── date-picker.tsx
├── date-picker.web.tsx
└── index.ts
```

Consumers import the Public API rather than selecting a platform file directly. Let Metro select `.ios`, `.android`, `.native`, or `.web` implementations. Every platform implementation must preserve the same export contract.

## Naming rules

- Layers, slices, segments, and ordinary files: `kebab-case`
- React components and TypeScript types or interfaces: `PascalCase`
- Hooks: `use-*.ts` filenames with `useSomething` exports
- Slice names: product terms or actions rather than technologies, such as `photo` or `share-photo`
- Do not introduce broad boundaries named `common`, `misc`, `utils`, `helpers`, `types`, `components`, or `hooks`.
- Make API filenames describe their purpose: `get-photo.ts`, `photo.queries.ts`, or `update-caption.mutation.ts`.

## Circular-dependency prevention checklist

1. Does an internal file import its own slice through `@/layer/slice`?
2. Does it import another slice on the same layer?
3. Does a Public API export the entire internal implementation?
4. Does a lower layer import upward only to obtain a type?
5. Is a proposed common type actually a business entity or a type local to one consumer?

## Sources

- [FSD layer import rule](https://feature-sliced.design/docs/reference/layers#import-rule-on-layers)
- [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
