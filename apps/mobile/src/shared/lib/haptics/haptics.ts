import * as Haptics from 'expo-haptics';

/** How firmly a physical acknowledgement lands. Only the strengths in use. */
export type ImpactStrength = 'light' | 'medium';

const IMPACT_STYLE: Record<ImpactStrength, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
};

// Android's generic vibration reads as an alert rather than a touch
// acknowledgement here, so the project plays haptics on iOS only. Each function
// absorbs that guard so callers never repeat it.
const isSupported = process.env.EXPO_OS === 'ios';

/** Acknowledge a press that starts something. */
export function impactFeedback(strength: ImpactStrength): void {
  if (!isSupported) return;
  void Haptics.impactAsync(IMPACT_STYLE[strength]);
}

/** Acknowledge picking one option out of several. */
export function selectionFeedback(): void {
  if (!isSupported) return;
  void Haptics.selectionAsync();
}

/** Acknowledge that an action completed successfully. */
export function successFeedback(): void {
  if (!isSupported) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
