import { ScrollView, StyleSheet, View } from 'react-native';

import {
  MaxContentWidth,
  Spacing,
  useSetThemeMode,
  useTheme,
  useThemeMode,
  type ThemeMode,
} from '@/shared/ui/theme';

import { OptionPill, SettingsSection } from './rows';

const themeModeOptions: readonly { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: '시스템' },
  { mode: 'light', label: '라이트' },
  { mode: 'dark', label: '다크' },
];

/**
 * The 화면 테마 settings screen (`/settings/theme`). The choice takes effect
 * immediately, so this screen is its own live preview — the three-way radio
 * and nothing else.
 */
export function MeThemePage() {
  const theme = useTheme();
  const themeMode = useThemeMode();
  const setThemeMode = useSetThemeMode();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection>
        <View style={styles.options}>
          {themeModeOptions.map(({ mode, label }) => (
            <OptionPill
              key={mode}
              flex
              label={label}
              selected={themeMode === mode}
              onPress={() => setThemeMode(mode)}
            />
          ))}
        </View>
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.eight,
    gap: Spacing.five,
  },
  options: { flexDirection: 'row', padding: Spacing.four, gap: Spacing.two },
});
