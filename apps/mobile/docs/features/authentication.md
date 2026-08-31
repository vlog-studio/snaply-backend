# Authentication

## User goal

Users sign in to Snaply with an email and password, or with Google, before reaching the app: they can create an account (confirmed via an emailed link that deep-links back into the app), sign in, and reset a forgotten password (also via an emailed link). A signed-in session gates the main experience and persists across restarts, and users can sign out from Settings. Google social sign-in is offered on the sign-in screen; Apple sign-in is deferred — its code and metadata are retained but not offered until the provider is configured.

## Current behavior

| Capability | Status | Actual behavior |
| --- | --- | --- |
| See the sign-in screen when signed out | `Functional` | The root route guard shows `/sign-in` whenever no session exists, including on cold start and deep links into protected routes. |
| Sign in with email and password | `Functional` | The email form validates the address format and password presence through `emailSignInSchema` (React Hook Form + Zod), then runs `supabase.auth.signInWithPassword`. A not-yet-confirmed account surfaces a distinct message pointing the user to confirm their email. Requires configured Supabase credentials (see below). |
| Create an account | `Functional` | `/sign-up` collects email + password (with confirmation), calls `supabase.auth.signUp` with `emailRedirectTo` set to the app deep link, and — because email confirmation is enabled — shows a check-your-email notice. Tapping the link in the email opens the app (`snaplyapp://auth/callback?code=…`); the global deep-link handler runs `exchangeCodeForSession`, which signs the user in. The confirmation email can be re-sent. |
| Reset a forgotten password | `Functional` | `/reset-password` sends a recovery link via `resetPasswordForEmail` (`redirectTo` = `snaplyapp://auth/reset`) and shows a check-your-email notice. Tapping the link opens the app; the handler exchanges the code for a recovery session and sets `isRecovering`, which the guard uses to force the `/update-password` screen where `updateUser` saves the new password. |
| Sign in with Google | `Functional` | The sign-in screen renders `SocialLoginList` (Google only) below the email form. Tapping it runs the PKCE OAuth flow (`signInWithOAuth` → in-app browser consent → `exchangeCodeForSession`); the resulting user is mirrored into the session and the guard reveals the app. Requires the Google provider configured in Supabase (see below). |
| Sign in with Apple | `Deferred` | The path is in place but no button is: `SocialProvider` includes `'apple'`, `supabaseAuthProvider.signIn('apple')` runs the same PKCE flow as Google, and the icon ships (`ui/provider-icons/apple.svg`). What is absent is the button's presentation metadata — `socialProviders` lists Google only, and the unused Apple entry was removed rather than kept dormant. Re-enable by adding a `SocialProviderMeta` for Apple to `socialProviders` and completing Apple provider setup below. |
| Development sign-in without a backend | `Functional` | In development builds (`__DEV__`) where Supabase credentials are absent (`isSupabaseConfigured` is false), email sign-in uses an offline mock instead of dead-ending on the placeholder host. Sign-up/reset mocks create no session (they cannot simulate an email deep link), so those flows only complete against a real Supabase project. Any production build always uses Supabase. |
| Pending and error feedback | `Functional` | The submit button shows a pending label and inputs disable while a request resolves — from the action hook's `isPending`, not the form's own submitting flag. Field-level validation errors render under each input and clear as the value is corrected; server failures render a Korean message near the button. |
| Stay signed in across restarts | `Functional` | Supabase persists its session through the chunked SecureStore adapter and restores it on launch; the splash overlay stays up until the initial session is read back. Tokens refresh automatically while the app is foregrounded. |
| Reach the app after signing in | `Functional` | Once a session exists the guard reveals the tabs and capture stack; no manual navigation is performed. |
| Sign out | `Functional` | The Settings account control calls `supabase.auth.signOut()`; the auth listener clears the mirrored session, returning the user to `/sign-in`. |
| Authorize backend requests with the session | `Functional` | `authHeader` reads the current Supabase access token per request and returns `Authorization: Bearer <access_token>`; `apiRequest` merges it into every HTTP call's headers and `openApiSocket` into the WebSocket handshake. Reading per request means a refreshed token is used without re-creating anything, and a signed-out state simply sends no header. |
| Blocked while an account is pending deletion | `Functional` | A soft-deleted account (deleted from Settings, inside its 30-day grace period) still authenticates — the Supabase account survives until the purge — but the backend rejects every other API request with `403 ACCOUNT_PENDING_DELETION`, carrying the purge deadline as `error.purgeAfter`. The root layout subscribes to the transport's error stream (`subscribeToApiErrors`) and flips the session store's `isPendingDeletion` on the first such response, storing that deadline with it; the route guard then forces `/account-restore` (no header, no back gesture) instead of the app, and the screen reads the date back (`2026년 9월 11일 이후 영구 삭제`). A response without the field — an older backend — leaves the screen stating the consequence without a date. |
| Restore a pending-deletion account | `Functional` | `/account-restore` offers exactly two ways out: 계정 복구 calls `POST /auth/me/restore` (allowed for deleted accounts), invalidates all queries (everything fetched while blocked errored with the 403), and clears the flag so the guard reveals the app again — the subscription, SNS connections, and notification token cleaned up at deletion time do not come back. 로그아웃 signs out, which also clears the flag so the next account starts clean. A `400 BAD_REQUEST` from restore means the account was not pending deletion — the stale flag is cleared the same way. |

## Route flow

```text
Cold start
  → splash overlay held until Supabase's initial session is read back
  → no session  → /sign-in (guarded)
  → session     → (tabs) and /capture/* (guarded)

/sign-in → enter email + password → signInWithPassword → session → guard reveals (tabs)
/sign-in → "가입하기" → /sign-up → signUp(emailRedirectTo) → "메일 확인" notice
           → tap email link → snaplyapp://auth/callback?code → exchangeCodeForSession → (tabs)
/sign-in → "비밀번호를 잊으셨나요?" → /reset-password → resetPasswordForEmail(redirectTo) → "메일 확인" notice
           → tap email link → snaplyapp://auth/reset?code → exchangeCodeForSession + isRecovering=true
           → guard forces /update-password → updateUser → finishPasswordRecovery → (tabs)
Settings → 로그아웃 → supabase.auth.signOut() → guard returns to /sign-in
Settings → 계정 삭제 → /settings/delete-account → DELETE /auth/me → signOut → /sign-in
  → sign in during the grace period → any API call → 403 ACCOUNT_PENDING_DELETION
  → isPendingDeletion=true → guard forces /account-restore
     → 계정 복구 → POST /auth/me/restore → flag cleared → (tabs)
     → 로그아웃 → guard returns to /sign-in
```

Email links are handled by real Expo Router routes — `/auth/callback` (sign-up
confirmation, and OAuth) and `/auth/reset` (recovery) — declared outside every
guard group so the deep link always resolves. Each screen exchanges the PKCE
`code` for a session and redirects. Using separate route paths (rather than one
global `Linking` listener) is required: Expo Router owns deep-link routing, so an
unrouted `snaplyapp://auth/...` link renders "Unmatched Route". The two paths also
let the handler tell confirmation from recovery without relying on the auth event.

`/sign-in`, `/sign-up`, and `/reset-password` live in the signed-out guard group.
`/update-password` lives in a recovery guard group (`isRecovering`) that takes
precedence over the authenticated group, so a recovery deep link — which signs
the user in — cannot reach the app until the new password is set.

## Ownership and state

| Concern | Owner |
| --- | --- |
| Session meaning, current user (incl. `AuthMethod` = social + `'email'`), hydration, recovery state, pending-deletion state and its purge deadline, sign-out | `src/entities/session` (`model/session-store.ts`, `model/user.ts`) |
| Delete-account and restore actions (`DELETE /auth/me`, `POST /auth/me/restore`), and narrowing the 403's `purgeAfter` | `src/features/delete-account` (`use-delete-account.ts`, `use-restore-account.ts`, `lib/read-purge-after.ts`) |
| Pending-deletion detection (transport error stream → session flag) | `src/_app/routes/root-layout.tsx` (`subscribeToApiErrors` → `markPendingDeletion`) |
| Delete confirmation and restore screen composition | `src/pages/me` (`me-delete-account-page.tsx`), `src/pages/account-restore` |
| Every Supabase call and Supabase type the session domain needs — auth subscription + token-refresh lifecycle, sign-out, code exchange, and the `SupabaseUser` → `User` mapping | `src/entities/session/api` (`session-gateway.ts`, `map-user.ts`) |
| Auth email deep-link code exchange (`exchangeAuthCode` → the gateway's `exchangeSessionCode` → `exchangeCodeForSession`) | `src/entities/session` (`model/session-store.ts`), invoked by the `auth/callback` + `auth/reset` route screens (`src/pages/auth-callback`) |
| Supabase client, session persistence, token auto-refresh; shared auth redirect URLs | `src/shared/lib/supabase` (`supabase-client.ts`, `auth-redirect.ts`) |
| Turning the current session into an `Authorization` header for both transports | `src/shared/api` (`auth-header.ts`, consumed by `client.ts` and `socket.ts`) |
| Large-value token storage | `src/shared/lib/secure-storage` (`chunked-secure-storage.ts`, `.web.ts`) |
| Email/format/password validation primitives, reused from inside each form schema | `src/shared/lib/validation` (`is-valid-email.ts`, `is-valid-password.ts`) |
| Themed text input primitive used by every auth form | `src/shared/ui/text-field` |
| `TextField` bound to a React Hook Form field (the only shared form code) | `src/shared/ui/form-text-field` |
| Form schemas and inferred value types (one per form, in the owning feature's `model`) | `email-sign-in-schema.ts`, `sign-up-schema.ts`, `request-reset-schema.ts`, `update-password-schema.ts` |
| Email sign-in action + provider abstraction; Google social sign-in action, provider metadata (`socialProviders` — Google only), and button UI | `src/features/sign-in` |
| Sign-up flow — create account + resend (provider, `use-sign-up-flow`, form + email-sent notice) | `src/features/sign-up` |
| Password reset — request link (`use-request-reset`) and set new password (`use-update-password`, provider, forms) | `src/features/reset-password` |
| Sign-in / sign-up / reset / update-password / auth-callback screen composition | `src/pages/sign-in`, `src/pages/sign-up`, `src/pages/reset-password`, `src/pages/update-password`, `src/pages/auth-callback` |
| Route files | `src/app/sign-in.tsx`, `src/app/sign-up.tsx`, `src/app/reset-password.tsx`, `src/app/update-password.tsx`, `src/app/auth/callback.tsx`, `src/app/auth/reset.tsx` (thin adapters) |
| Access-control composition (route guard) and session bootstrap | `src/_app/routes/root-layout.tsx` (`Stack.Protected` + `initSession`) |
| Sign-out control | `src/pages/me` (calls the session entity's `useClearSession`) |
| Handing the local library (snaps, movies, upload state) and the query cache to the signed-in account | `src/_app/providers/library-scope-gate.tsx`, over `src/shared/lib/scoped-store` |
| The deleted-account ledger and the purge of a deleted account's local library once its grace period ends | `src/features/delete-account` (`model/deleted-account-ledger.ts`, `model/purge-local-library.ts`, `ui/deleted-library-purge-gate.tsx`) |

**Supabase owns the session.** The `supabase` client persists the session (access token, refresh token, user) via the chunked SecureStore adapter and refreshes tokens automatically while the app is active. The zustand session store no longer persists its own copy; instead `initSession` (run once from the root layout) subscribes through `entities/session/api/session-gateway`, mirrors the derived `User` into the store, and flips `hasHydrated` on the first event. `initSession` is the single writer for backend-driven changes (restore on launch, refresh, sign-out); the sign-in action additionally writes the user directly for immediate feedback (and to support the offline mock provider). The store still exposes the same focused selector hooks (`useCurrentUser`, `useIsAuthenticated`, `useSessionHydrated`, `useSetSession`, `useClearSession`) through the slice Public API.

**Signing in changes whose data the app holds.** Snaps, movies, and upload state are local files, so they are stored per user and re-bound whenever the session user changes — `_app/providers/library-scope-gate.tsx` does that, and clears the TanStack Query cache with it, because query keys name a request and not an account. Signing out binds the empty scope: the previous account's data leaves memory at once but stays on the device, since a local library has no copy anywhere else. What is on disk and what still is not cleaned up is documented in [Snap library](snaps.md#file-model-and-storage-boundary).

**Deleting an account does not delete its library yet.** Deletion is a soft delete with a 30-day restore window, and the local snaps are the only copy that exists — a restore that came back to an empty library would make the promise on the confirmation screen worthless. So `useDeleteAccount` writes the account id and the `purgeAfter` the backend reported into a device-level ledger (`snaply.deleted-accounts`, unscoped on purpose: it is read while nobody is signed in, on behalf of accounts that can no longer sign in), and `DeletedLibraryPurgeGate` deletes the recordings, thumbnails, and three store files of every account whose deadline has passed — never the signed-in one, which can still restore itself. Restoring drops the entry. The sweep runs on an app start, so an account deleted on a device that is never opened again keeps its files until the app is uninstalled; nothing else can be done from the client.

**The session domain does not know Supabase.** `api/session-gateway.ts` is the entity's whole contact surface with the auth backend — `subscribeToSession` (subscription + lifecycle-bound token refresh, reporting `{ user, isRecovery }`), `endSession`, and `exchangeSessionCode` — with `api/map-user.ts` as its DTO mapper. `model/session-store.ts` sees only `User`, `boolean`, and that contract, so replacing the backend is a rewrite of the `api` segment rather than of the session state model. There is deliberately no provider interface here: one implementation exists, and the module boundary is already the seam the store's test substitutes. The four Supabase auth *actions* keep their own provider interfaces (below) because they genuinely have two implementations each.

Every auth action is isolated behind a provider interface, selected once per hook behind `__DEV__ && !isSupabaseConfigured` (Supabase in production, offline mock in unconfigured dev builds): social sign-in (`AuthProvider`, `use-sign-in.ts`), email sign-in (`EmailAuthProvider`, `use-email-sign-in.ts`), sign-up (`SignUpProvider`, `use-sign-up-flow.ts`), and password reset (`ResetPasswordProvider`, `use-request-reset.ts` + `use-update-password.ts`). Screens, routing, and the store are unaffected by which implementation is bound. **Email confirmation and password recovery complete out of band**: the emailed link deep-links into the app, Expo Router routes it to the `/auth/callback` or `/auth/reset` screen, and that screen calls `exchangeAuthCode` (`exchangeCodeForSession`); the `onAuthStateChange` listener then mirrors the user, so no feature hook verifies a token. Navigation stays fully declarative via the route guard reacting to `isAuthenticated` / `isRecovering` — no auth hook navigates. The derived `User` (`entities/session/api/map-user.ts`) carries only identity fields (`id`, `provider` as `AuthMethod`, `displayName`, `avatarUrl`); no tokens are copied out of the Supabase session.

## Backend contract

The backend does not perform login. The app authenticates against Supabase directly; the resulting JWT is sent as `Authorization: Bearer <access_token>` to the backend API, which verifies it against Supabase's JWKS and upserts the app user on first call.

That injection is wired: `src/shared/api/auth-header.ts` reads the token from `supabase.auth.getSession()` on each call, and both transports — `apiRequest` (HTTP) and `openApiSocket` (WebSocket) — merge its result into their headers rather than each holding a token of their own. The app itself never calls `GET /auth/me`; the upsert happens on whichever authenticated request runs first.

## Platform support

- **Email/password sign-in** uses only the Supabase client over HTTP, so it works anywhere once Supabase credentials are set.
- **Sign-up confirmation and password reset rely on email deep links** back to the `snaplyapp://` scheme, so they need a build that registers the custom scheme (development build or standalone) — the custom-scheme round-trip is unreliable in the standard Expo Go client. The confirmation/recovery link must be opened **on the same device running the app** for the automatic sign-in to complete (PKCE stores the code verifier on the initiating device). Opening it elsewhere still confirms the email server-side; the user then signs in with their password.
- The **iOS Simulator has no Mail app**, so a confirmation email cannot be opened inside it directly. To test, feed the link into the simulator, e.g. `xcrun simctl openurl booted "snaplyapp://auth/callback?code=…"`, or paste the confirmation URL into Simulator Safari.
- On web, session persistence uses localStorage (per the chunked adapter's `.web` variant); native uses SecureStore.
- Deferred social sign-in additionally uses the `expo-web-browser`/`expo-auth-session` native modules; offering social login on iOS also requires **Apple sign-in** for App Store review.

## Configuration

Environment (`.env`, see `.env.example`):

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — client-safe values from the Supabase project (anon key is public, gated by Row Level Security). Without them the app still boots for mock/offline development but real sign-in cannot complete.

Supabase dashboard (one-time setup for email/password):

- Auth → Sign In / Providers → Email: keep **Email** enabled, **Confirm email** on, and user sign-up allowed.
- Auth → URL Configuration → Redirect URLs: allow **both** `snaplyapp://auth/callback` (sign-up confirmation) and `snaplyapp://auth/reset` (password recovery). These are the `emailRedirectTo` / `redirectTo` targets the app passes.
- The default **Confirm signup** and **Reset password** email templates (which use `{{ .ConfirmationURL }}`) work as-is — **no template editing required**. This is the reason for the deep-link approach: editing default-sender templates is restricted on new free-tier projects, whereas Redirect URL configuration is not.

Social provider setup:

- Auth → Providers: enable **Google** (OAuth client id/secret from Google Cloud Console) — **required** for the Google button to complete sign-in. Enable **Apple** (Service ID, Team ID, Key ID, private key from Apple Developer) only when re-enabling Apple.
- The `snaplyapp://auth/callback` redirect above is reused by the OAuth flow.
- Google/Apple consoles: register the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`.

## Token storage

Supabase's session is stored under its own key (`sb-<project-ref>-auth-token`) through `chunkedSecureStorage`. Because a session JSON commonly exceeds SecureStore's ~2048-byte single-value limit, the adapter splits it across numbered keys (`<key>.0`, `<key>.1`, …) with a `<key>.chunks` count, staying encrypted at rest in the OS keychain/keystore. Splitting is UTF-8-byte-aware and never divides a surrogate pair.

## Known limitations and implementation requirements

- Real authentication requires the Supabase configuration above (URL + anon key, and the two Redirect URLs). Unit tests mock the Supabase client at the slice Public API and never hit the network.
- Email confirmation and password reset use **deep links**, not OTP codes. Both callback URLs (`snaplyapp://auth/callback`, `snaplyapp://auth/reset`) must be in the Redirect allowlist, and the link must be opened on the app's device for automatic sign-in (see Platform support).
- The offline dev mocks cannot simulate an email deep link, so **sign-up and password reset only complete against a real Supabase project**; email sign-in still works via the mock offline.
- Google sign-in is offered; Apple sign-in is deferred (code/metadata retained, not listed in `socialProviders`). Offering social login on iOS eventually requires Apple sign-in for App Store review, so enable Apple before an iOS store submission. Kakao/Naver are still not offered — Supabase Auth does not support them without custom OIDC setup.
- The Google OAuth flow uses the `expo-web-browser` / `expo-auth-session` native modules and the `snaplyapp://` custom scheme, so it needs a development build or standalone app (not the standard Expo Go client), on the same device that initiates it (PKCE stores the code verifier locally).
- Pending deletion is detected reactively: the flag flips on the first API response carrying `ACCOUNT_PENDING_DELETION`, so a grace-period account that signs in sees the app shell until some request fails (in practice immediately — FCM registration and content fetches run on entry). In mock mode (`USE_MOCK_API`) no request can carry the 403, so the restore screen is reachable only against a real backend.
- The purge deadline reaches the app only through the 403's `error.purgeAfter`; there is no endpoint a pending-deletion account may call to ask for it (every route except restore is blocked). The screen therefore falls back to a date-less sentence whenever the field is absent, and the app never computes a deadline from the local clock.
- `ApiError.details` is deliberately untyped (`Record<string, unknown>`): the transport carries a failing response's extra fields without reading them, and the slice that owns the error's domain narrows them. Adding a second such field means adding a reader next to `readPurgeAfter`, not widening the transport.
