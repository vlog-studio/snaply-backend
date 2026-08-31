# SOLID principles for React Native

## Purpose

Apply the intent of SOLID to functions, React components, custom hooks, modules, services, types, behavioral contracts, and dependency direction. Do not mechanically reproduce Java-style class hierarchies or Spring-style layers in this React Native codebase.

SOLID complements the project's Feature-Sliced Design (FSD) rules; it does not replace them. FSD determines where code belongs and which dependency directions are allowed. This guide helps decide how responsibilities and contracts should be shaped inside those boundaries. When extracting code, continue to follow [Feature-Sliced Design project standard](../architecture/feature-sliced-design.md) and [Module boundaries and import rules](module-boundaries.md).

Apply the two standards in this order:

1. Use FSD to identify the owning layer, slice, and segment from the code's current product scope.
2. Check that every dependency points to an allowed lower layer and that external slices are consumed through their Public APIs.
3. Apply SOLID inside those boundaries to separate change reasons and shape focused contracts.
4. Extract code to another slice or layer only when its actual reuse or responsibility justifies the new scope.

SOLID is not an exception to an FSD rule. A SOLID-motivated refactor must not introduce an upward import, a same-layer cross-slice import, a deep import into another slice, or a new architecture layer such as `repositories` or `use-cases`.

## SRP: Single Responsibility Principle

A component, hook, or module should have one clear reason to change. Judge responsibility by change reasons and concepts, not by file length alone. Code that changes together and expresses one coherent concept may remain together even when the file is not small.

Do not make one screen component own all of these concerns:

- API requests
- Data transformation
- Form state and validation
- Permission checks
- Navigation control
- Complex UI rendering
- Analytics events
- Local or secure storage access

When those responsibilities become difficult to understand or change independently, separate them by purpose:

| Responsibility | Typical unit |
| --- | --- |
| Screen-level orchestration and composition | Page or screen component |
| Presentation and visual interaction | UI component |
| State and interaction coordination | Custom hook in the owning slice's `model` or `ui` segment |
| External communication | API module, service, or focused adapter |
| DTO validation and data transformation | Mapper in the owning `api` or `model` segment |
| Reusable policy or calculation | Focused domain function or business-agnostic library |

A custom hook is not automatically a good extraction. Extract one when it gives a stateful interaction a clear boundary, supports testing, or lets the UI describe presentation more directly. Do not move unrelated logic into a large hook merely to shorten a component.

## OCP: Open-Closed Principle

Avoid structures where every new supported behavior requires editing the same core conditional repeatedly. Prefer the smallest extension seam that matches a demonstrated change pattern:

- Props and composition
- `children`
- Render callbacks
- Strategy functions
- Configuration objects
- Explicit, type-safe variants
- Adapters that share a meaningful contract

Do not turn a simple component into a plugin system. Introduce an extension abstraction only when at least one of these is true:

- A real new behavior must be added without destabilizing existing behavior.
- The same kind of edit has already repeated.
- Multiple implementations are required now.
- A volatile external dependency must be isolated.

Prefer a direct implementation for the current requirement until evidence for an extension point exists.

## LSP: Liskov Substitution Principle

Components and functions that implement the same type or interface must preserve the expectations of their consumers. A shared type is a behavioral contract, not merely a convenient set of matching fields.

For example, every variant using a common button contract must consistently:

- Respect `disabled`.
- Follow the same `onPress` invocation rules.
- Prevent duplicate input while loading when the contract promises that behavior.
- Preserve required accessibility properties.
- Give each shared prop the same meaning.

Platform-specific modules must also preserve the same exported contract, as required by [Module boundaries and import rules](module-boundaries.md#platform-specific-modules).

Do not force components or functions with different behavior into one common type. If their guarantees differ, use separate types or separate components and make the distinction explicit to consumers.

## ISP: Interface Segregation Principle

Components, hooks, and functions should receive only the contract they use. Avoid passing large response objects or application-wide configuration objects to consumers that need only a small portion of them.

```tsx
// Avoid: the component becomes coupled to unrelated API and app details.
<UserCard user={entireUserResponse} config={entireAppConfig} />

// Prefer: a focused presentation contract.
<UserCard displayName={user.displayName} avatarUrl={user.avatarUrl} />
```

Keep a meaningful domain model intact when its fields form one coherent concept. Do not decompose props into primitives so aggressively that the domain meaning and invariants disappear.

Apply the same rule to custom hooks and stores:

- Do not return a large bag of unrelated state and actions.
- Expose focused capabilities that reflect the consumer's task.
- With Zustand, subscribe through focused selectors instead of the entire store.
- Do not expose transport DTOs as UI contracts when a smaller view model or domain model is appropriate.

## DIP: Dependency Inversion Principle

Screens and business rules should not depend directly on volatile external tools such as Axios, AsyncStorage, SecureStore, analytics SDKs, notification SDKs, or a specific upload client. Higher-level policy should depend on a project-owned function, contract, or adapter when a dependency boundary provides concrete value.

Possible boundaries include:

- An authentication-storage contract with a SecureStore implementation
- Project-owned analytics event functions backed by an analytics SDK
- A file-upload service backed by a concrete HTTP client
- A notification service backed by Expo Notifications
- A user data source backed by the real API

Introduce such a boundary when one or more of these conditions applies:

- The external library may realistically be replaced.
- Tests need a substitute implementation.
- Multiple implementations exist.
- Core business rules are becoming polluted with tool-specific details.
- Native platforms require different implementations.

Do not create an interface or dependency-injection container for every function. A single stable implementation behind a straightforward project-owned module is often sufficient. Follow the placement rules in [State and data placement](../frameworks/state-and-data.md): technical adapters generally belong in a focused `shared` boundary, while product meaning and orchestration remain in their owning page, feature, or entity.

### FSD placement guardrails for dependency inversion

Dependency inversion changes what higher-level code knows about a dependency; it does not reverse the project's allowed import direction.

| Boundary | Typical placement |
| --- | --- |
| Business-agnostic SDK or transport adapter | Focused module under `shared/api` or `shared/lib` |
| Product-specific request, gateway, policy, or contract | `api` or `model` segment of the owning page, feature, or entity |
| Application-wide initialization or implementation selection | Appropriate `_app` segment |

Keep the boundary at the lowest layer that can describe it without importing product meaning from a higher layer. In particular:

- Do not move a product-specific contract into `shared` merely so multiple modules can import it.
- Do not make a `shared` adapter import a type from a page, feature, widget, or entity.
- When a higher-level contract is genuinely useful, let the owning slice adapt a lower-level technical function or satisfy the contract through structural typing at the higher-level composition point.
- Keep a direct dependency when it is stable, local, and harmless; a new boundary must still meet one of the concrete conditions above.

## Avoid over-engineering

SOLID does not require any of the following by default:

- An interface with only one implementation and no testing or volatility need
- Multiple wrappers around a simple API call
- Repository, service, and use-case layers without distinct responsibilities
- A proliferation of files that each contain a trivial one-line function
- Generic components with no actual reuse
- Passing every dependency through dependency injection
- Java or Spring-style layer replication
- Extensibility for requirements that do not exist

Choose abstractions based on change reasons and dependency direction, not code duplication alone. Similar-looking code may remain separate when it changes for different reasons. Prefer the simplest implementation that satisfies the current requirement, then expand the structure after a repeated change pattern is visible.

## Required process before implementation

Before implementing a feature or refactor:

1. Explore the relevant screens and existing behavior.
2. Find the closest existing implementation in the project.
3. Read all applicable guides from `AGENTS.md` and verify the directory rules.
4. Identify the responsibilities being changed and the modules they affect.
5. Decide whether an existing pattern is sufficient or whether there is evidence for a new abstraction.
6. Write a short implementation plan.

Do not add behavior that the user or requirement did not request. If documentation and implementation diverge, update the relevant documentation with the implementation or report the discrepancy instead of spreading an undocumented exception.

## Code implementation safeguards

- Avoid `any`; model unknown input explicitly and narrow it safely.
- Do not hide type problems with assertions. Validate or narrow at the boundary.
- Avoid unnecessary `useEffect`; derive values during rendering when possible.
- Do not store state that can be calculated from props or existing state.
- Do not turn a simple event flow into a chain of effects.
- Do not create mutable module-level state for component behavior.
- Follow the Rules of Hooks.
- Account for request races, cancellation where supported, stale results, and screen unmounts in asynchronous flows.
- Do not assume web-only APIs exist in React Native.
- Distinguish Expo Go-compatible APIs from capabilities that require a development build.
- Consider iOS and Android behavioral differences and preserve shared contracts across platform implementations.
- Do not add `useMemo`, `useCallback`, or `memo` by habit; use them when measurement, referential stability, or an expensive calculation justifies them.
- For `FlatList` and related virtualized lists, review stable keys, pagination, item layout, justified memoization, and image loading behavior.
- Never include secrets, private credentials, or sensitive keys in the client bundle.

## Verification and review checklist

After implementation, run the canonical automated gate (its check list is defined in `package.json`):

```sh
npm run verify
```

Verify behavior on each relevant platform. Then confirm:

- [ ] Each changed component, hook, and module has a clear reason to change.
- [ ] Screen orchestration, presentation, state, external effects, and mapping are separated where their change reasons differ.
- [ ] New abstraction is justified by an existing implementation, repeated change pattern, test seam, platform difference, or volatile dependency.
- [ ] Shared component and function variants preserve the same behavioral contract.
- [ ] Props, hook results, store selectors, and dependency objects expose only what consumers need.
- [ ] Business logic depends on project-owned boundaries when direct SDK coupling would be harmful.
- [ ] No SOLID-motivated abstraction introduces an upward import, same-layer cross-slice import, or deep import.
- [ ] Technical adapters remain business-agnostic, while product-specific contracts and orchestration stay in their owning slice.
- [ ] No unnecessary interface, wrapper chain, layer, generic component, or dependency-injection mechanism was added.
- [ ] Types are explicit, hooks are valid, derived state is not duplicated, and effects are necessary.
- [ ] Async races, navigation away from the screen, and relevant platform differences were considered.
- [ ] Expo Go versus development-build requirements are documented when relevant.
- [ ] List performance and image loading were reviewed when a virtualized list changed.
- [ ] No client-bundled secrets or sensitive credentials were introduced.
- [ ] `npm run verify` and affected-platform verification results are recorded.
- [ ] Documentation was updated if responsibilities, contracts, dependencies, or supported behavior changed.
