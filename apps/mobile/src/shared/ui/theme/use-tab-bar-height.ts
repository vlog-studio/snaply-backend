import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Height of the tab bar's content area above the bottom safe-area inset.
 * Shared between the tab navigator (which sizes the bar) and screens (which
 * offset their scroll content) so the two never drift apart.
 *
 * Tall enough to seat the capture button rather than have it tower over the
 * bar: the button is 52pt, so a 40pt bar made it read as bolted on.
 */
export const TabBarContentHeight = 52;

/**
 * Total height the docked tab bar occupies, including the bottom safe-area
 * inset. The bar is translucent and absolutely positioned, so scrollable
 * screens must add this as bottom padding to keep content from ending up
 * permanently behind the blur.
 */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TabBarContentHeight;
}
