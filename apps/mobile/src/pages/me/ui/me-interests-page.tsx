import { ScrollView, StyleSheet, View } from 'react-native';

import {
  INTEREST_OPTIONS,
  useInterests,
  useToggleInterest,
} from '@/features/notification-settings';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';

import { OptionPill, SettingsSection } from './rows';

/**
 * The 관심사 settings screen (`/settings/interests`). The selection
 * personalizes which nearby spots the location push announces; it persists
 * locally and is enforced server-side when that push is decided.
 */
export function MeInterestsPage() {
  const theme = useTheme();
  const interests = useInterests();
  const toggleInterest = useToggleInterest();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection>
        <View style={styles.chips}>
          {INTEREST_OPTIONS.map((interest) => (
            <OptionPill
              key={interest}
              role="checkbox"
              label={interest}
              selected={interests.includes(interest)}
              onPress={() => toggleInterest(interest)}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.four, gap: Spacing.two },
});
