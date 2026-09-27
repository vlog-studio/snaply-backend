import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "reduce motion" accessibility setting. Screens with signature
 * animations (generation progress, mount fade-ins) read this to present the
 * final state immediately instead of animating — skip the scan/bloom, show the
 * end state at once (docs/frameworks/animations-and-gestures.md, "Respect
 * reduced motion"). Starts `false` and resolves on mount,
 * then stays in sync via the change subscription.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
