# Credits and rewarded ads

## User goal

Movie generation costs credits (one export = 100). The 크레딧 screen (`/settings/credits`) shows the balance, the recent ledger, and one row that turns a rewarded ad into credits. The movie screen is where credits are *spent*; this screen is where they are seen and earned.

## Where the truth lives

The balance's only source is the backend (`GET /billing/credits`). Grants land server-side — a store purchase through its webhook, an ad view through the ad network's server-side verification (SSV) callback — so the app **never** computes, adjusts, or reports a balance change. It reads, and after anything that should have changed the balance it invalidates and reads again.

The same holds for the rewarded-ad policy: the reward amount, the daily limit, the cooldown, and whether the feature exists at all are the server's answers (`GET /billing/ad-rewards`). The app hardcodes none of them, so a policy change (or the kill switch) lands without a release.

## Current behavior

| Capability | Status | Actual behavior |
| --- | --- | --- |
| Balance read-out | `Functional` | Verified on device against the real backend (2026-08-14). The 나 tab's 크레딧 row reads the current balance as its one-line summary; `/settings/credits` shows it as the hero with "보유 크레딧 · 무비 1편 = 100" under it. While loading or on error the row shows no number rather than a stale one; the screen offers 다시 불러오기 on error. |
| Ledger (내역) | `Functional` (not yet seen with data) | The verification account has no ledger rows, so the list has only ever rendered empty on a device. The newest 50 rows (the server's window — not the full history, no pagination), each as reason + timestamp + signed delta. Known reasons map to Korean labels (`purchase` 크레딧 구매, `signup_bonus` 가입 보너스, `export_reserve` 무비 만들기, `export_refund` 만들기 취소 환급, `store_refund_revoke` 구매 환불 회수, `promo` 프로모션, `ad_reward` 광고 보상); an unknown reason falls back to 기타 instead of failing the response — the DTO deliberately widens the spec's enum to `string`. |
| Watch a rewarded ad | `Partial` | One row: "광고 보고 +N" with the day's remaining count as its read-out, shown only while the server's `enabled` is true. Pressing it issues a reward session (`POST /billing/ad-rewards`), shows an AdMob rewarded ad carrying the session's `nonce`/`ssvUserId`, then polls `GET /billing/ad-rewards/{rewardId}` (7 attempts, 1.5 s apart) until the server confirms the grant. On `granted` both the credit and availability queries are invalidated and the row answers "+N 지급됐어요." **`Partial` because the app's own ad unit has never served an ad**: the SDK, the Android App ID, and the provider are in place, and Google's public test unit does play on device, but that unit carries no SSV callback — so no grant has ever landed, and iOS has no AdMob app — see [Required to finish](#required-to-finish-admob-integration). |
| Insufficient balance on generate | `Functional` | Verified on device against the real backend (2026-08-14): a 0-credit account pressing 이 구성으로 다시 만들기 got "크레딧이 부족해요 · 0/100…" and the movie was left untouched. `POST /edit-jobs` answering `402 INSUFFICIENT_CREDITS` becomes the movie footer's own refusal (`no-credit`): "크레딧이 부족해요 · {balance}/{required}. 나 탭의 크레딧에서 채울 수 있어요." — the numbers come from the 402's `error.required`/`error.balance` and are omitted when absent. Reserved credits are refunded server-side when a run fails or is cancelled; the app just refetches. |
| Buy credits | `Not implemented` | The backend sells consumable credit packs through store IAP (RevenueCat; `GET /billing/products`, `POST /billing/sync`), but no purchase UI or store SDK exists in the app. The 크레딧 screen shows no purchase entry rather than a dead one. |

## The rewarded-ad flow, and why it is shaped this way

The app never tells the server "the ad was watched" — no such request exists, by design: a client-callable grant endpoint would be an attack surface (replay, rooted devices). The grant is written when the ad network's SSV callback reaches the backend. Hence:

- The SDK's reward event is treated as a *hint to start polling*, never as proof of a grant.
- `pending` (the ad completed but the grant had not landed within the poll window) is a **normal outcome, not a failure** — worded "지급 확인 중이에요. 잔액에 곧 반영돼요." The queries are invalidated even then, so a late grant appears on the next refetch.
- A `409 AD_REWARD_SESSION_ACTIVE` on session issue means the previous ad's grant is still in flight; the hook resumes polling that session (`error.rewardId`) instead of refusing.
- **An ad that never reached its reward point hands the slot back** (`DELETE /billing/ad-rewards/{rewardId}`). Only one session may be pending at a time, so without this a dismissed ad would lock the next one out until the session expired. The direction is safe — the app can only ever give a reward up, never create one — and it is not a forfeit: the session keeps its grant eligibility, so a callback already in flight still pays (`abandoned` → `granted`). A failed release is not surfaced: the session times out on its own, which is the behavior this call exists to shorten. The app does **not** release after a `pending` settle — an ad that did reach its reward point may still be paid, and the wait is the same either way now that the session TTL matches the cooldown.
- Session refusals map to their own read-outs: `AD_REWARD_COOLDOWN` 잠시 뒤에, `AD_REWARD_LIMIT_REACHED` 오늘은 다 봤어요, `AD_REWARDS_DISABLED` hides the entry point entirely (`enabled: false` is the server's kill switch).
- A dismissed ad (closed before the reward point) gets no reproach line — the user's own call; the row's unchanged state is the answer.

## Required to finish: AdMob integration

The SDK is wired and the Android app builds with it, and an ad does play on device — but only from **Google's public test unit**, which cannot call back: `react-native-google-mobile-ads` is installed, its config plugin puts the Android App ID in the merged manifest, and `admobRewardAdProvider` is the provider the flow selects whenever a real API origin is configured. What no one has seen is *this app's own unit* serving an ad, or a credit actually landing. (Monorepo tracking: [backlog C-6](../../../../docs/backlog.md).)

Verified on device (2026-08-14, SM-S908N, against the real backend with `AD_REWARD_ENABLED=true`) with the *mock* provider: session issue, the `showing` → `settling` phases, the `pending` outcome, and the `409 AD_REWARD_SESSION_ACTIVE` resume branch all work. Everything *after* a grant — the `granted` outcome, the ledger row, the daily-limit countdown — is still covered only by unit tests, because a grant requires a signed SSV callback that only a real ad view produces.

### Done

1. **AdMob console (Android)** — app `ca-app-pub-4341953141795570~1619593560`, rewarded unit `ca-app-pub-4341953141795570/1413273107`, with server-side verification pointed at the backend's callback (`GET /billing/webhook/admob`).
2. **SDK and native config** — the package plus its config plugin in `app.json` (Android App ID → the manifest's `com.google.android.gms.ads.APPLICATION_ID`, verified in the merged manifest; the SDK also adds `com.google.android.gms.permission.AD_ID`). Ad unit IDs are env, read through [`shared/config/ads.ts`](../../src/shared/config/ads.ts); **development builds always request Google's test unit** (`TestIds.REWARDED`), since a live ad served to a developer is invalid traffic.

   **Test ads must come from a registered test device, not from Google's test ad unit.** SSV is configured *per ad unit*: Google's public test unit is Google's own and carries no callback URL, so an ad played against it fires the SDK's reward event and nothing else — the session sits at `pending` and no request ever reaches the backend's webhook. `EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS` (declared through `setRequestConfiguration` before initialize) serves test ads from *this app's* unit, which does call back. A dev build with no registered device falls back to Google's unit and warns that no credit can be earned.

   **`react-native-google-mobile-ads` is pinned to an exact `16.0.0`, not a range.** From 16.1.0 it bundles Google Mobile Ads Android SDK 25.x, whose classes carry Kotlin 2.3 metadata; this project compiles with the Kotlin that Expo SDK 57 / React Native 0.86 ship (2.1), and Gradle fails the module's `compileDebugKotlin` outright ("Module was compiled with an incompatible version of Kotlin"). 16.0.0 pins ads SDK 24.6.0 and builds. Do not widen the range or upgrade the package until the toolchain's Kotlin is 2.3 or newer.
3. **The provider** — [`admob-reward-ad-provider.ts`](../../src/features/watch-reward-ad/model/admob-reward-ad-provider.ts): loads a rewarded ad with the session's `nonce` as the SDK's `customData` and `ssvUserId` as its `userId`, shows it, and maps the SDK's events onto `earned` / `dismissed` / `unavailable`. The SDK is required lazily behind a try/catch (it throws at module evaluation without its native module, as in Expo Go), a `.web.ts` sibling answers `unavailable`, and `mockRewardAdProvider` is now selected only in mock-API mode.

### Still open

1. **A grant, end to end — blocked on AdMob app review (2026-08-19).** Every link the app controls is verified: the App ID in the merged manifest, the ad unit ID, the registered test device, and the SSV callback URL (reachable from the public internet, answers a parameter-less GET with `400 BAD_REQUEST`). Requesting this app's own unit nonetheless answers `no-fill / Publisher data not found`, and the AdMob console shows the app as **검토 필요**: the app has not passed review, so its units serve nothing — not even to a registered test device. Google's public test unit does serve, but it is Google's ad unit and carries no SSV callback, so it can never produce a grant. **Nothing in the app can move this**: AdMob verifies an app against its store listing, and Snaply is not on Play yet, so clearing review depends on a public listing existing first (an internal-testing track does not produce one). Until then the rewarded-ad feature cannot pay a credit in any build.
2. **A publicly reachable callback URL** — the SSV callback is made by Google's servers, so the URL configured on the ad unit must be reachable from the internet. A LAN origin like the `EXPO_PUBLIC_API_BASE_URL` used for device testing (`http://192.168.0.58:3000`) can never receive one; the ad unit needs a deployed backend or a tunnel.
3. **Backend allowlist** — `ADMOB_SSV_ALLOWED_AD_UNITS` must contain the ad unit ID above; the backend rejects every callback while it is empty.
4. **Consent, before the SDK initializes** — Google UMP for GDPR and, on iOS, ATT (`expo-tracking-transparency`). Both are app-start concerns, so they belong in an `_app` provider gate alongside `PushTokenGate`, not inside this feature. Until this lands the SDK initializes on the first ad with no consent signal, which is not shippable in the EEA.
5. **iOS** — no AdMob app exists, so there is no iOS App ID for the config plugin, no `SKAdNetworkItems`, and `EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID_IOS` is blank. An iOS build would initialize the SDK without `GADApplicationIdentifier`; the App ID must be added to the plugin before one is made.
6. **Store declarations** — App Store Connect privacy (device ID collected for tracking, the IDFA question) and Play Console (contains ads, data safety for the advertising ID, content rating). The SDK adds the `AD_ID` permission on Android, and shipping without declaring it is a review rejection.

## Ownership

- `src/entities/credit` — the balance domain model, `GET /billing/credits` (DTO → domain), `creditQueries`. The mock ledger (`api/mock-credits.ts`) is mutable so mock-mode grants move the balance; `grantMockCredits`/`readMockCreditBalance` are exported as a documented mock-only seam.
- `src/features/watch-reward-ad` — the four `/billing/ad-rewards` calls (availability, issue, poll, release), `adRewardQueries.availability()`, the `RewardAdProvider` seam and its two implementations (`admob-reward-ad-provider.ts` + its `.web.ts`, and `mock-reward-ad-provider.ts`), selected in one place (`use-watch-reward-ad.ts`) by `USE_MOCK_API`, and the `useWatchRewardAd` state machine (`idle → preparing → showing → settling`).
- `src/shared/config/ads.ts` — the per-platform rewarded ad unit ID read from env. The App IDs are not here: they are baked into the native manifest by the config plugin in `app.json`.
- `src/features/compose-movie` — the `no-credit` generation refusal and `readCreditShortfall` (narrows the 402's `required`/`balance` off `ApiError.details`, same split as `delete-account`'s `readPurgeAfter`).
- `src/pages/me` — the 크레딧 screen (`ui/me-credits-page.tsx`), the tab-root summary row, and the user-facing copy for reasons, phases, and refusals.
- Route: `src/app/settings/credits.tsx` (thin re-export), registered on the root stack with a titled header (크레딧).

## Platform support

The credit and reward-session behavior is JavaScript-only and runs on iOS, Android, and web alike. The ad itself is native-only: the web provider variant answers `unavailable`, and so does the native one in Expo Go or a dev client built before the SDK was added. Only Android is configured — iOS has no AdMob app yet.

## Known limitations

- **No credit has ever been earned end to end.** Google's test-unit ad plays on device, but the app's own unit no-fills (pending AdMob app review) and the test unit has no SSV callback, so the reward has never been granted — detailed in [Required to finish](#required-to-finish-admob-integration). No consent flow (UMP/ATT) either, and iOS is unconfigured.
- With no API origin configured (`USE_MOCK_API`) the whole feature runs against in-code mocks, including a mock reward server that grants after one `pending` poll; that mock ledger resets on reload.
- No purchase path (see the table row above), and therefore no restore-purchases either.
- The movie screen does not yet show the balance or the 100-credit cost *before* the generate press — the cost is still discovered on refusal. That read-out is owed when the paid flow goes live (see [The movie screen](movie.md), "How many runs a user gets").
