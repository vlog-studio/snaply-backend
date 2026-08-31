import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/shared/ui/theme';

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  // The native splash follows the OS appearance (expo-splash-screen `dark`
  // variant), not the in-app theme mode, so the mirror must read the OS too.
  const systemScheme = useColorScheme();
  const background = systemScheme === 'light' ? Colors.light.background : Colors.dark.background;

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: { transform: [{ scale: 1 }], opacity: 1 },
    20: { opacity: 1 },
    70: { opacity: 0, easing: Easing.elastic(0.7) },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const mark = (
    <Image
      contentFit="contain"
      source={require('@/assets/images/brand-glyph-ember.png')}
      style={styles.glyph}
    />
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={[styles.splashOverlay, { backgroundColor: background }]}
    >
      {mark}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        void SplashScreen.hideAsync().finally(() => setAnimate(true));
      }}
      style={[styles.splashOverlay, { backgroundColor: background }]}
    >
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  // Must mirror the native splash exactly (expo-splash-screen in app.json):
  // the OS-scheme background + brand-glyph-ember at imageWidth 150, centered.
  glyph: { width: 150, height: 150 },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
