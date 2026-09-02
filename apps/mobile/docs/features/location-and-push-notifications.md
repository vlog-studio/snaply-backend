# Location alerts and push notifications

## User goal

While signed in, Snaply can notify the user when they arrive near a nearby capture spot ("주변 촬영 스팟"). The device registers for push, monitors the nearest points in the background, and reports arrivals so the backend can send an arrival push. The user's preference for this — the master switch, quiet hours, and interests — lives in [Me tab](me.md); this document owns the mechanism those preferences drive.

The backend owns the arrival decision and FCM send, and that pipeline is implemented. The client also registers push tokens and monitors OS geofences against the real API when an origin is configured. What remains unverified is the complete real-device path from a geofence enter event to a displayed notification.

## Current behavior

| Capability | Status | Actual behavior |
| --- | --- | --- |
| Register the device for push (FCM) | `Partial` | While authenticated, the app *checks* the notification grant (never prompts — the OS ask belongs to the 무비 완성 알림 switch, see [Me tab](me.md)); with the grant it registers with APNs (iOS), reads the FCM token, and posts it to `POST /auth/fcm-token`, re-posting on token refresh. Without the grant it does nothing until the grant lands (the movie-alert opt-in re-triggers the check) or the next app start. Routes to a mock until an API origin is configured. Native only. |
| Present a foreground push | `Partial` | A message arriving while the app is foregrounded is re-presented as a local notification (`expo-notifications`), because FCM suppresses the system banner in the foreground. Requires the `expo-notifications` native module to be present in the build. |
| Start/stop geofence monitoring | `Functional` | Off by default. Turning 위치 알림 받기 on runs the two-stage ask (an in-app sheet, then the OS foreground and background prompts — see [Me tab](me.md)); with the grants stored, monitoring resolves the current position, loads nearby points, and starts OS geofencing on the nearest ones. At app start the gate only *checks* the grants (never prompts): both present → monitoring resumes; revoked → it silently does not start. Turning the switch off stops all monitoring. Native only. |
| Report an arrival | `Partial` | On a geofence *enter* event the app posts the location id to `POST /notifications/geofence-enter`, even when relaunched headlessly in the background. It uses the real API when an origin is configured and an in-code mock otherwise. The request and server route are implemented; a headless real-device enter has not been verified end to end. |
| Receive an arrival push | `Partial` | The backend applies `notification_enabled`, quiet hours, and 30-minute per-(user, location) dedup, composes the message, and sends it through Firebase Admin. Real FCM sending and invalid-token cleanup are verified server-side, but no complete geofence-to-device receipt has been recorded. |

## Route and entry points

There is no screen or route for this feature. It is composed headlessly at the app layer and driven by app lifecycle and OS events:

- `src/_app/providers/app-providers.tsx` renders `<PushTokenGate />` and `<GeofenceGate />` once, high in the tree, for the whole authenticated session.
- `src/_app/routes/register-background-tasks.ts` is a side-effect import from `src/_app/routes/root-layout.tsx`. It runs `TaskManager.defineTask` at global scope so the geofence task is defined at startup — including when the OS relaunches the app headlessly on a geofence event, before any screen mounts.
- The master switch that gates all of it is the 위치 알림 받기 control in [Me tab](me.md).

## Ownership and state

| Layer | Module | Responsibility |
| --- | --- | --- |
| `src/_app/providers` | `geofence-gate.tsx` | Headless bridge: reads `useNotificationEnabled` (notification-settings) and drives `useGeofenceMonitoring` (geofence-monitor). The two features must not import each other, so the app layer composes them. |
| `src/_app/providers` | `push-token-gate.tsx` | The same bridge shape for push: reads `useMovieReadyEnabled` (notification-settings, the one control whose opt-in obtains the notification grant) and passes it as `PushTokenRegistrar`'s `recheckKey`, so a fresh grant re-runs the registrar's check without waiting for the next app start. |
| `src/_app/providers` | `app-providers.tsx` | Mounts `PushTokenGate`, `GeofenceGate`, and `MovieGenerationBridge`, alongside the five headless nodes this feature does not use ([Application shell and navigation](app-shell-and-navigation.md#composition-and-ownership)). |
| `src/_app/providers` | `movie-generation-bridge.tsx` | The same bridge shape for the other notification preference: reads `useMovieReadyEnabled` and lets `compose-movie` announce a finished or failed generation. Documented in [The movie screen](movie.md). |
| `src/_app/routes` | `register-background-tasks.ts` | Side-effect import that defines the background geofence task at startup. |
| `src/features/register-push-token` | `ui/push-token-registrar.tsx`, `model/use-push-token.ts`, `api/register-fcm-token.ts` | Acquire and keep the FCM token registered while authenticated — check-only on the notification grant (never prompts; `recheckKey` re-runs the check); present foreground messages locally; `POST /auth/fcm-token` (mock-routed). |
| `src/features/geofence-monitor` | `model/use-geofence-monitoring.ts` | Bridge the `enabled` preference to OS geofencing: check permissions (never prompt — requesting belongs to the 위치 알림 받기 switch), resolve position, load nearby points, start/stop monitoring. Native only. |
| `src/features/geofence-monitor` | `model/geofence-monitor.ts` | Check-only permission gate (`hasGeofencePermissions`: foreground and background "항상 허용") and start/stop that always replaces the active region set. |
| `src/features/geofence-monitor` | `model/geofence-task.ts` | `defineTask` at global scope; on *enter* applies a 5-minute in-memory client cooldown and calls `reportGeofenceEnter`. |
| `src/features/geofence-monitor` | `lib/select-nearest-regions.ts` | Haversine sort + cap at `MAX_MONITORED_REGIONS` (20, the stricter iOS ceiling), mapped to `expo-location` regions with `notifyOnEnter` only. |
| `src/features/geofence-monitor` | `api/report-geofence-enter.ts` | `POST /notifications/geofence-enter` (mock-routed). |
| `src/features/notification-settings` | `model/*` | Owns the `notification_enabled` / `quiet_start` / `quiet_end` / `interests` preferences (persisted Zustand store), plus the local-only `movieReady` preference and the permission grant it needs. Surfaced in [Me tab](me.md). |
| `src/entities/location` | `model/location.ts`, `api/*` | The geofence-point domain model and `GET /locations` reads (DTO validation + mapping, TanStack Query options, in-code mock). |
| `src/shared/lib/notifications` | `messaging.ts`, `local.ts` (+ `.web`) | Platform adapters for FCM (permission, remote registration, token, refresh/foreground subscriptions) and local notification presentation, including its own permission request (`requestLocalNotificationPermission`) — separate from the FCM one, which resolves false wherever the Firebase native module is absent. Firebase is loaded lazily and degrades to inert stubs when the native module is absent. |
| `src/shared/lib/location` | `permissions.ts`, `geofencing.ts`, `current-position.ts` | Raw `expo-location` permission, geofencing, and current-position calls. |

Backend fields these map to: `POST /auth/fcm-token` (raw token), `POST /notifications/geofence-enter` (`locationId`), `GET /locations` (`lat`/`lng`/`radius`), and the user-profile fields enforced server-side (`notification_enabled`, `quiet_start`, `quiet_end`, `interests`).

The `GET /locations` response carries `id`, `name`, `lat`, `lng`, `radiusMeters`, `category` (free-form text), and `distanceMeters`, ordered nearest-first. The app maps all but `distanceMeters`, because it re-derives distance against its own resolved position when it selects the regions to monitor. The response has **no notification-copy template**: the arrival message is composed and sent entirely by the backend.

## Platform support

- **iOS / Android**: push registration and geofence monitoring run natively.
- **Web**: geofencing is skipped (`useGeofenceMonitoring` returns early, no task is defined) and the notification adapters are inert web stubs.
- **Expo Go**: `@react-native-firebase` is not bundled, so the messaging adapter degrades to inert stubs and push registration is silently skipped with a dev-only warning instead of crashing at startup. Geofencing needs a dev/release build with the native modules present.

## Known limitations and implementation requirements

- Arrival reports and token registrations call real endpoints (`POST /notifications/geofence-enter`, `POST /auth/fcm-token`) when an API origin is configured, and in-code mocks under `USE_MOCK_API`. The server notification-send pipeline exists; the remaining gap is a recorded end-to-end real-device delivery from geofence enter through foreground/background display.
- Geofence monitoring needs foreground **and** background ("항상 허용") location permission. Only the 위치 알림 받기 switch requests them (after the in-app sheet's yes); the app-start gate is check-only, so a grant revoked in OS settings means monitoring silently does not start until the switch is toggled again. Resolving the position and nearby points also needs a location/network fix, so there is a short delay before monitoring begins.
- On Android 13+, presenting a delivered notification also requires the `POST_NOTIFICATIONS` runtime permission (separate from location permission).
- At most `MAX_MONITORED_REGIONS` (20) points are monitored at once, the nearest to the resolved position; the set is recomputed each time monitoring (re)starts.
- The 5-minute client cooldown is in-memory only and resets on a cold background relaunch; the authoritative 30-minute per-(user, location) dedup is the backend's responsibility.
- Quiet hours and interests are collected locally but not synced to the backend (`GET|PATCH /auth/me` are in the API spec, not yet called by the client); they are enforced server-side when the arrival push is decided (see [Me tab](me.md)).

To close the partial status, verify end-to-end FCM display on a dev/release build, move `notification_enabled`/`quiet_start`/`quiet_end`/`interests` to server-backed queries/mutations on `/auth/me`, and record the verified success and failure paths here.
