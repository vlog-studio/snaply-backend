# State and data placement

This project's standard tools are TanStack Query v5, Zustand, React Hook Form, Zod, and Expo SecureStore. Zustand, Expo SecureStore, TanStack Query, and Zod are wired up and in use: `QueryClientProvider` and the app-wide `queryClient` live in `_app/providers` (see [`query-client.ts`](../../src/_app/providers/query-client.ts) and [`app-providers.tsx`](../../src/_app/providers/app-providers.tsx)), and Zod validates DTOs at the transport boundary. React Hook Form drives every form in the app (the four auth forms), each backed by a Zod schema in its owning feature's `model`. Do not create top-level directories for each tool. Place state according to the product responsibility it represents and its actual usage scope.

## Classify the state first

| State kind | Default tool | Default location |
| --- | --- | --- |
| Asynchronous server data | TanStack Query | The entity or page `api`; provider in `_app/providers` |
| Form input and validation | React Hook Form with Zod | `model` in the feature or page that owns the action |
| Presentation state for one component | React state | The relevant `ui` file or same slice |
| Client state shared by multiple components | Zustand | `model` in the lowest common owning slice |
| Persistent or secure storage technology | SecureStore adapter | `shared/lib/secure-storage` |
| Product meaning of a session or token | Entity or feature | The actual domain owner, such as `entities/session/model` |

## TanStack Query

### QueryClient

`_app/providers` owns QueryClient creation, `QueryClientProvider`, and global retry or cache policies. Do not create a new QueryClient singleton inside a feature or page.

### Query and key placement

- If a request retrieves one business entity, put it in `entities/<entity>/api`.
- If it is a composite endpoint meaningful to only one screen, it may live in `pages/<page>/api`.
- If no business entity exists yet and only an external API controller boundary is needed, put it in `shared/api/<controller>`.
- Keep query keys and query functions together in a `queryOptions`-based factory rather than scattering them. The skeleton is [cookbook §4 (query key + options factory)](../conventions/cookbook.md#4-query-key--options-factory).

Reuse query keys through the factory for invalidation. Do not repeat raw key arrays in UI code.

### Mutation placement

Place a mutation by the user action rather than mechanically grouping it with read queries.

- Reused actions such as `share` or `update-caption`: `api` or `model` in `features/<action>`
- A mutation used by only one screen: `pages/<page>/api`
- A reusable pure request function: `entities/<entity>/api` or `shared/api`

Cache invalidation and optimistic updates are part of the mutation behavior, so keep them near the feature or page that owns the mutation. A lower layer must not know the post-processing rules of a higher-layer feature.

### API boundaries

A client in `shared/api` encapsulates transport concerns such as HTTP status handling, transport errors, and authentication headers. Do not expose DTOs as if they were application-wide domain types. Validate DTOs with Zod and map them to domain models in the entity or page `api` segment.

## Zustand

Do not use Zustand as the default for all global state.

1. Check whether component state is sufficient.
2. If the source is server data, use TanStack Query.
3. If the source of truth is a URL or route parameter, keep it in Expo Router.
4. If multiple UI components in one slice share it, put the store in that slice's `model`.
5. If multiple pages share business state, identify the appropriate entity or feature owner.
6. Consider `_app/store` only for app-wide technical state.

A store should expose domain actions rather than a bag of values and setters. Components should subscribe through focused selectors instead of subscribing to the entire store.

## React Hook Form and Zod

- If a form represents a reused user action, keep its schema and form type in the feature `model`.
- If it is used by one screen, keep it in the page slice.
- Infer the TypeScript type from the Zod schema instead of declaring it twice.
- Put only business-agnostic primitives, such as a common adapter, in shared.
- The owning feature or page coordinates submission mutations and post-success navigation; shared form controls must not know those details.

The one shared piece is [`shared/ui/form-text-field`](../../src/shared/ui/form-text-field): `TextField`
bound to a form field through `useController`. It knows how a controlled field
works and nothing about what is submitted, which mutation runs, or where the
screen goes next. The copyable skeleton is
[cookbook §16](../conventions/cookbook.md#16-form-with-schema-validation).

Reuse the existing validation primitives in `shared/lib/validation` from inside a
schema (`z.string().refine(isValidEmail, …)`) rather than substituting Zod's own
checks. The project's rules are deliberately shaped — the email pattern is
permissive on purpose — and a schema is where the product's message for a failed
rule belongs, not a second definition of the rule.

Pending state belongs to the action hook that owns the request, not to
`formState.isSubmitting`. A form reads `isPending` from its hook so there is one
source of truth for "a request is in flight".

## SecureStore and device APIs

SecureStore is a technical adapter, so wrap it in a small API under `shared/lib/secure-storage`. The session or authentication domain still owns which keys are stored and when they are removed.

```text
shared/lib/secure-storage/     # Technical get/set/remove implementation
entities/session/model/       # Session meaning and state
features/sign-in/             # Sign-in action and token-storage orchestration
```

Apply the same principle to Camera, Media Library, Location, and Notifications. Native calls and permission access may use narrow shared adapters, but product flows and user-facing error messages stay out of shared.

## Error and loading states

- Transport-level error normalization: `shared/api`
- Missing entity data or mapping errors: `entities/<entity>/api|model`
- Action failure and retry behavior: `features/<feature>`
- Screen-wide loading, error, and empty presentation: `pages/<page>/ui`
- Errors that prevent the application from starting: `_app/providers`

## Sources

- [FSD Usage with TanStack Query](https://feature-sliced.design/docs/guides/tech/with-react-query)
- [FSD Layers](https://feature-sliced.design/docs/reference/layers)
