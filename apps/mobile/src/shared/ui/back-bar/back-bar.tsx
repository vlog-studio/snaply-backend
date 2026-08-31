import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/** The tap target keeps the 44dp minimum; the glyph inside it is 24. */
const TargetSize = 44;
const IconSize = 24;

/**
 * Pull the target left by its own padding, so the *glyph* lands on the content
 * column's edge rather than the tap area's — an arrow indented 10dp past the
 * title under it reads as a mistake.
 */
const EdgeInset = Spacing.five - (TargetSize - IconSize) / 2;

/** Platform back convention: a chevron on iOS, an arrow on Android. */
const BackIcon = Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back';

/** The one action a titled bar may carry, on the trailing edge. */
type BackBarAction = {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Names the action for screen readers — the glyph alone does not. */
  label: string;
  onPress: () => void;
};

export type BackBarProps = {
  onPress: () => void;
  /** Overridden when "back" needs naming for a specific screen. */
  accessibilityLabel?: string;
  /**
   * The thing the screen is about, for a screen that cannot spend a row on
   * naming it below the bar.
   */
  title?: string;
  /** An action on that thing; only meaningful beside a `title`. */
  action?: BackBarAction;
};

/**
 * The way out of a pushed screen — and, where the screen has no room to name
 * itself, the line that names it.
 *
 * It replaced a titled navigation bar, which over these screens said the same
 * thing twice: the bar named the *kind* of screen (`템플릿`, `무비`) while the
 * screen's own first line named the thing itself (`동네 산책`). The generic one
 * is the one worth losing — every tab screen already opens on a large title
 * with no bar above it, so dropping the chrome is what makes a pushed screen
 * look like the rest of the app rather than an exception to it.
 *
 * A scrolling screen keeps that shape: bare bar, title in the content. A
 * screen whose zones are all fixed (`/movie/[id]`, where the stage lives on
 * whatever height the rest leaves over) hands its title to the bar instead,
 * because the row under the arrow is 44dp of tap target with a 28dp line's
 * worth of empty space in it — the title rides along for free, and the row it
 * used to occupy goes to the stage.
 *
 * Either way the bar stays pinned rather than scrolling away with the content:
 * it is the only visible way back on iOS, where there is no system back button.
 */
export function BackBar({
  onPress,
  accessibilityLabel = '뒤로 가기',
  title,
  action,
}: BackBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.target, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Ionicons color={theme.text} name={BackIcon} size={IconSize} />
      </Pressable>

      {title ? (
        <ThemedText
          accessibilityRole="header"
          selectable={false}
          numberOfLines={1}
          type="heading"
          style={styles.title}
        >
          {title}
        </ThemedText>
      ) : null}

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [styles.target, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons color={theme.text} name={action.icon} size={IconSize} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    // The trailing target is pulled by the same inset as the arrow, so both
    // glyphs land on the content column's edges rather than their tap areas'.
    paddingHorizontal: EdgeInset,
  },
  // Takes the room between the two targets; the arrow's own padding already
  // holds it off the glyph.
  title: { flex: 1, marginLeft: Spacing.one },
  target: {
    width: TargetSize,
    height: TargetSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
