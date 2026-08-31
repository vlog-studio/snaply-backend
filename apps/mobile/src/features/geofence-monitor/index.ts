// Side-effect import: evaluating this module runs `TaskManager.defineTask` at
// global scope, which is why `_app/routes/register-background-tasks` imports the
// barrel at startup. Stated explicitly rather than left to ride on whichever
// named export happens to pull the module in.
import './model/geofence-task';

export { useGeofenceMonitoring } from './model/use-geofence-monitoring';
