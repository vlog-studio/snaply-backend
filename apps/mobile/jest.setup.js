// jest-expo installs Expo's "winter" runtime globals (notably `fetch`) as lazy
// getters. The first access requires the winter runtime, which warns because
// the `ExpoModulesCoreJSLogger` native module is unavailable under Jest. When
// that first access happens during a later suite's teardown (which can occur
// once several suites share a worker under `--runInBand`), the warning logs
// after the test environment has closed and Jest fails the whole run with
// "Cannot log after tests are done". Materialize the getter once here, while
// the console is still open, so no later access can trigger it.
void globalThis.fetch;
