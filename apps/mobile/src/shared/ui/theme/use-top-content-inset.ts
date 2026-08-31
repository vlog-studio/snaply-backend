import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Extra top padding for scrollable screens without a header.
 * `contentInsetAdjustmentBehavior` is iOS-only, so Android content must
 * offset the status bar manually to match the iOS layout.
 */
export function useTopContentInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? insets.top : 0;
}
