// Side-effect import: evaluating the geofence-monitor feature runs
// TaskManager.defineTask at global scope. This module is imported once from the
// root layout so the task is defined at app startup — including when the OS
// relaunches the app headlessly on a geofence event, before any screen mounts.
import '@/features/geofence-monitor';
