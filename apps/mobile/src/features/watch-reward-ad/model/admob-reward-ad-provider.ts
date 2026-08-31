import { AD_TEST_DEVICE_IDS, REWARDED_AD_UNIT_ID } from '@/shared/config/ads';

import type { RewardAdProvider } from './reward-ad-provider';

// The AdMob implementation of the RewardAdProvider seam. Ad-network concerns
// only — loading, showing, and mapping the SDK's events onto the three results
// the flow understands. The reward session, the polling, and every user-facing
// word live in the feature above this file, which never learns AdMob exists.
// A `.web.ts` sibling answers `unavailable`, since there is no web SDK.

// The SDK subscribes to its native event emitter at module evaluation and
// throws when the native module is absent (Expo Go, or a dev client built
// before this package was added), so it must be loaded lazily — the same guard
// `shared/lib/notifications/messaging.ts` uses for Firebase. When unavailable,
// every ad is simply `unavailable`, which the flow already handles.
type GoogleMobileAds = typeof import('react-native-google-mobile-ads');

const ads: GoogleMobileAds | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import evaluates (and throws) before this guard can run
    return require('react-native-google-mobile-ads') as GoogleMobileAds;
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[watch-reward-ad] react-native-google-mobile-ads native module unavailable ' +
          '(Expo Go or stale dev build) — rewarded ads disabled:',
        String(error),
      );
    }
    return null;
  }
})();

/**
 * How long to wait for an ad to arrive before giving up.
 *
 * The SDK reports no-fill as an error event, so this only covers a load that
 * never answers at all; the user is sitting on a "준비 중" button meanwhile.
 */
const LOAD_TIMEOUT_MS = 20_000;

/**
 * How long to keep listening for the reward event after the ad closes.
 *
 * The reward and the close event are not ordered against each other on every
 * platform, so settling the moment the ad closes can throw away a reward that
 * was about to arrive — and losing it here would cost the user the credits
 * the ad already earned them.
 */
const REWARD_AFTER_CLOSE_MS = 500;

let initialized: Promise<unknown> | null = null;

/**
 * Initialize the SDK once per app run, on the first ad rather than at start-up.
 *
 * Deferred on purpose: initialization reaches the network and, on a first run,
 * is where consent and ATT would be resolved. Nothing else in the app shows
 * ads, so nothing pays that cost until the user asks for one.
 *
 * Registered test devices are declared first, so they take effect on the very
 * first request. Without that declaration this app's own unit would serve a
 * *live* ad to a developer, which is invalid traffic and can suspend the AdMob
 * account.
 */
function initialize(sdk: GoogleMobileAds): Promise<unknown> {
  initialized ??= (async () => {
    if (AD_TEST_DEVICE_IDS.length > 0) {
      await sdk.default().setRequestConfiguration({ testDeviceIdentifiers: AD_TEST_DEVICE_IDS });
    }
    return sdk.default().initialize();
  })();
  return initialized;
}

/**
 * The unit to request.
 *
 * Always this app's own unit, because **the SSV callback is configured on the
 * ad unit**: Google's public test unit is Google's, carries no callback URL,
 * and so pays nothing however faithfully the ad plays. Test ads come from
 * registering the device instead (`AD_TEST_DEVICE_IDS`), which serves test ads
 * from our unit and still fires the callback.
 *
 * The one case that falls back to Google's test unit is a development build on
 * an unregistered device: requesting the real unit there would serve a live ad
 * and count as invalid traffic. Such a run can show an ad but can never earn a
 * credit, so it says so.
 *
 * Empty when the platform has no unit configured, which the caller reads as
 * "no ad to show".
 */
function resolveAdUnitId(sdk: GoogleMobileAds): string {
  if (__DEV__ && AD_TEST_DEVICE_IDS.length === 0) {
    console.warn(
      "[watch-reward-ad] no test device registered — falling back to Google's test ad unit. " +
        'It sends no SSV callback, so the reward will stay `pending`. Set ' +
        'EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS to the id the ads SDK logs on the first request.',
    );
    return sdk.TestIds.REWARDED;
  }
  return REWARDED_AD_UNIT_ID;
}

export const admobRewardAdProvider: RewardAdProvider = {
  async show({ nonce, ssvUserId }) {
    if (!ads) return 'unavailable';

    const adUnitId = resolveAdUnitId(ads);
    if (!adUnitId) {
      if (__DEV__) console.warn('[watch-reward-ad] no rewarded ad unit is configured');
      return 'unavailable';
    }

    try {
      await initialize(ads);
    } catch (error) {
      if (__DEV__) console.warn('[watch-reward-ad] ad SDK init failed:', String(error));
      initialized = null;
      return 'unavailable';
    }

    const { AdEventType, RewardedAd, RewardedAdEventType } = ads;
    // The session's nonce and user id ride the request so the ad network can
    // hand them back on its SSV callback; that callback is what actually pays
    // the user, so a request without them earns nothing no matter what the
    // user watched. `customData`/`userId` are the SDK's names for the pair the
    // backend reads as the nonce and the account.
    const ad = RewardedAd.createForAdRequest(adUnitId, {
      serverSideVerificationOptions: { userId: ssvUserId, customData: nonce },
    });

    return new Promise((resolve) => {
      let earned = false;
      let settled = false;
      let loadTimer: ReturnType<typeof setTimeout> | undefined;
      let closeTimer: ReturnType<typeof setTimeout> | undefined;

      const settle = (result: 'earned' | 'dismissed' | 'unavailable') => {
        if (settled) return;
        settled = true;
        clearTimeout(loadTimer);
        clearTimeout(closeTimer);
        ad.removeAllListeners();
        resolve(result);
      };

      const unsubscribe = ad.addAdEventsListener(({ type, payload }) => {
        switch (type) {
          case RewardedAdEventType.LOADED:
            clearTimeout(loadTimer);
            try {
              ad.show();
            } catch (error) {
              if (__DEV__) console.warn('[watch-reward-ad] could not show the ad:', String(error));
              settle('unavailable');
            }
            break;
          case RewardedAdEventType.EARNED_REWARD:
            earned = true;
            break;
          case AdEventType.CLOSED:
            // Give a reward event that is still in flight its moment to land
            // before deciding the user walked away empty-handed.
            if (earned) settle('earned');
            else
              closeTimer = setTimeout(
                () => settle(earned ? 'earned' : 'dismissed'),
                REWARD_AFTER_CLOSE_MS,
              );
            break;
          case AdEventType.ERROR:
            // No fill, a network failure, or a bad unit — all the same to the
            // user, and all recoverable by trying again later.
            if (__DEV__) console.warn('[watch-reward-ad] ad error:', String(payload));
            settle('unavailable');
            break;
        }
      });

      loadTimer = setTimeout(() => settle('unavailable'), LOAD_TIMEOUT_MS);

      try {
        ad.load();
      } catch (error) {
        if (__DEV__) console.warn('[watch-reward-ad] could not load an ad:', String(error));
        unsubscribe();
        settle('unavailable');
      }
    });
  },
};
