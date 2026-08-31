import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type AccessibilityRole } from 'react-native';

import { Radius, Spacing, useTheme, type ThemeColor } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type RowIconName = keyof typeof Ionicons.glyphMap;

/**
 * Leading icon badge shared by every settings row, so the rows read as one
 * list instead of a mix of platform emoji weights and colors.
 */
function RowIcon({ name }: { name: RowIconName }) {
  const theme = useTheme();

  return (
    <View style={[styles.rowIcon, { backgroundColor: theme.backgroundSelected }]}>
      <Ionicons color={theme.textSecondary} name={name} size={18} />
    </View>
  );
}

/**
 * One settings row: icon badge, title with an optional state read-out, and a
 * trailing control. With `onPress` it is a navigation row; without, a static
 * row whose `right` node (a switch, a button) carries the interaction.
 */
export function SettingRow({
  icon,
  title,
  sub,
  subColor = 'textSecondary',
  subLines,
  right,
  onPress,
  accessibilityLabel,
}: {
  icon?: RowIconName;
  title: string;
  sub?: string;
  subColor?: ThemeColor;
  /**
   * Clamp for the read-out. The 나 root's summary rows pass 1 — a summary that
   * wraps is a summary that failed — but detail rows leave it unset so a
   * blocked-permission explanation is never cut mid-sentence.
   */
  subLines?: number;
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      {icon ? <RowIcon name={icon} /> : null}
      <View style={styles.rowCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {sub ? (
          <ThemedText type="small" themeColor={subColor} numberOfLines={subLines}>
            {sub}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        style={styles.settingRow}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={styles.settingRow}>{content}</View>;
}

/** Hairline between rows of one section card. */
export function RowDivider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}

export function SettingsSection({ children, title }: React.PropsWithChildren<{ title?: string }>) {
  const theme = useTheme();

  return (
    <View style={styles.sectionWrap}>
      {title ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title}
        </ThemedText>
      ) : null}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * One selectable pill of a radio or checkbox group — theme mode, daily
 * frequency, and interests all draw from this so selection reads the same way
 * everywhere on the 나 screens.
 */
export function OptionPill({
  label,
  selected,
  onPress,
  role = 'radio',
  accessibilityLabel,
  flex,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: Extract<AccessibilityRole, 'radio' | 'checkbox'>;
  accessibilityLabel?: string;
  flex?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.optionPill,
        flex && styles.optionPillFlex,
        {
          backgroundColor: selected ? theme.text : theme.background,
          borderColor: selected ? theme.text : theme.border,
        },
      ]}
    >
      <ThemedText
        selectable={false}
        type="smallBold"
        style={{ color: selected ? theme.background : theme.text }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  settingRow: {
    minHeight: 64,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, gap: 1 },
  sectionWrap: { gap: Spacing.two },
  sectionCard: {
    borderWidth: 1,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  optionPill: {
    minHeight: 44,
    minWidth: 56,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionPillFlex: { flex: 1 },
});
