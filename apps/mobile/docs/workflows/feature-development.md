# Feature development workflow

## 1. Define the change in user language

Before creating files, answer each of these in one sentence or confirm them in the task notes:

- What will the user be able to do?
- On which screen does the flow start and end?
- What are the core business entities?
- Which parts have a real first-use case for reuse?

Find slice candidates through product language, not library names or component types.

Before implementation, read [`docs/features/README.md`](../features/README.md) and every feature document the flow affects, as its [maintenance contract](../features/README.md#documentation-maintenance-contract) requires.

## 2. Start with the route and page

When a new URL or screen is required, use this order:

1. Implement the screen in a `pages/<page>` slice.
2. Expose the screen component from the slice-root `index.ts`.
3. Make the `src/app` route file default-export the page Public API or wrap it in a thin adapter.
4. Pass route parameters to the page as explicit props.

Do not split page-specific UI and logic into features or widgets from the start.

## 3. Extract lower layers only with evidence

- The same user action appears on two screens: feature candidate
- The same large independent block appears on multiple screens: widget candidate
- Multiple actions share a noun-like model and rules: entity candidate
- The code is independent of the product: shared candidate

If two pieces of code look similar but have different reasons to change, duplication is acceptable. Avoid careless duplication of business logic, but also avoid premature extraction into shared.

## 4. Divide a slice by purpose

Add only the segments that are needed.

```text
features/share-photo/
├── ui/share-photo-button.tsx
├── model/use-share-photo.ts
├── api/share-photo.ts
└── index.ts
```

Do not create secondary technical classifications such as `ui/components`, `model/hooks`, or `model/types` to wrap a single file. Make filenames explain their responsibility.

## 5. Review dependencies

For each new import, check (the rules are in [module boundaries](../conventions/module-boundaries.md)):

- Is the dependency on a lower layer?
- If it is on the same layer, is it within the same slice?
- Does it use the external slice's Public API?
- Does code inside one slice use relative imports?
- Has an upper-layer concept been pulled into shared merely to make it common?

If an implementation seems to require a rule violation, first check whether orchestration can move upward into a page or widget.

## 6. Place state and external effects

- Server state: TanStack Query
- Forms: React Hook Form with Zod
- Local presentation state: React state
- Shared client state: Zustand store in the owning slice
- Expo SDK or external service: separate a shared adapter from the higher-level product flow

Follow [State and data placement](../frameworks/state-and-data.md) for detailed rules.

## 7. Verify the change

Run the automated gate before finishing ([AGENTS.md § Verification](../../AGENTS.md#verification)).

For route changes, also verify that:

- App startup and deep links open the correct page.
- The UI renders on each affected platform, on the surfaces in [`local-development-and-testing.md`](local-development-and-testing.md#verification-surfaces-read-first).
- Route files contain no business logic or reusable components.
- Platform-specific files preserve the same export contract.

For native modules or config-plugin changes, use the Expo SDK 57 documentation to check development-build and prebuild implications.

Update the affected feature documents in the same change, per the [maintenance contract](../features/README.md#documentation-maintenance-contract).

## Code-review checklist

- [ ] Slice names express product terms or user actions.
- [ ] No new layer or deprecated `processes` layer was introduced.
- [ ] `src/app` contains route-related files only.
- [ ] Page-specific code was not moved unnecessarily into features, widgets, or shared.
- [ ] No same-layer slice imports exist.
- [ ] External slices are consumed through explicit Public APIs.
- [ ] No `export *` or deep imports exist.
- [ ] No broad collection directories forbidden by the [naming rules](../conventions/module-boundaries.md#naming-rules) were introduced.
- [ ] Server, client, and form state use tools and locations appropriate to their roles.
- [ ] SDK APIs match the Expo SDK 57 documentation.
- [ ] Feature documents were updated as the [maintenance contract](../features/README.md#documentation-maintenance-contract) requires.
- [ ] `npm run verify` passes, and affected-platform verification results are available.

## When to update documentation

Feature documents change with every user-visible change, as the [maintenance contract](../features/README.md#documentation-maintenance-contract) sets out. Update the architecture, convention, or framework documents as well when a change:

- Introduces a new architecture exception.
- Adds a shared segment or shared-library category.
- Changes the responsibility boundary between the route adapter and `_app`.
- Changes the state-management or API standard.
