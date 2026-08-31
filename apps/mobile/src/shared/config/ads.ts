import { Platform } from 'react-native';

/**
 * Rewarded-ad unit configuration.
 *
 * The unit IDs are per platform and per environment, so they are read from env
 * rather than committed: an AdMob unit belongs to one app on one store listing,
 * and a build pointed at the wrong one either serves nothing or serves ads the
 * console attributes elsewhere. Empty whenever a platform has no unit yet,
 * which the provider reads as "no ad to show" instead of guessing.
 */
export const REWARDED_AD_UNIT_ID =
  Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID_ANDROID,
    ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID_IOS,
  }) ?? '';

/**
 * Devices allowed to receive test ads from this app's own ad units.
 *
 * This is how a rewarded ad is exercised end to end. Google's public test unit
 * cannot do it: server-side verification is configured *per ad unit*, that unit
 * belongs to Google, and no SSV callback is ever sent for it — the ad plays,
 * the reward event fires, and the backend hears nothing, so the session sits at
 * `pending` forever. Requesting this app's real unit from a registered test
 * device serves the same test ads *and* fires the callback.
 *
 * The SDK prints the identifier to log the first time it requests an ad
 * ("Use RequestConfiguration.Builder().setTestDeviceIds(...)"). It is per
 * device and per install, so it belongs in a developer's own `.env`, never in
 * the committed one. Comma-separated; `EMULATOR` covers any emulator.
 */
export const AD_TEST_DEVICE_IDS = (process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS ?? '')
  .split(',')
  .map((id: string) => id.trim())
  .filter(Boolean);
