import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { TemplateOffer } from '@/features/fill-template';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type TemplatePanelProps = {
  offers: TemplateOffer[];
  onOpen: (templateId: string) => void;
};

/**
 * Narrow enough that a third card reaches into the page's gutter on a phone —
 * two cards and a sliver, so the row reads as a row rather than as the whole
 * shelf. The catalog holds four templates and the old 168 fitted exactly two.
 */
const CardWidth = 148;

/** The studio's own horizontal padding, which the row scrolls out through. */
const PageGutter = Spacing.five;

/**
 * The other way to start a movie: pick the shape first and let the app find the
 * material, instead of gathering material and deciding later.
 *
 * It sits beside the tray rather than replacing it, because the two answer
 * different questions — the tray is "these ones", a template is "something like
 * this" — and because the shortfall a card prints ("4/6컷 있음") is the one thing
 * in the app that tells a user what to go out and shoot.
 *
 * The row scrolls out through the page's own padding: bleeding to the screen
 * edge is what makes the next card visible, and a card cut by the edge is the
 * only honest signal that there are more than the two that fit. The offers
 * arrive ordered by shortfall, so the two that fit are the two worth seeing.
 */
export function TemplatePanel({ offers, onOpen }: TemplatePanelProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText type="smallBold">템플릿으로 시작</ThemedText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.row}
      >
        {offers.map(({ template, filled, slotCount }) => {
          const isComplete = filled === slotCount;
          return (
            <Pressable
              key={template.id}
              accessibilityRole="button"
              accessibilityLabel={`${template.name} · ${template.description} · ${slotCount}컷 중 ${filled}컷 있음`}
              onPress={() => onOpen(template.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText selectable={false} type="smallBold" numberOfLines={1}>
                {template.name}
              </ThemedText>
              <ThemedText
                selectable={false}
                type="small"
                themeColor="textSecondary"
                numberOfLines={2}
                style={styles.description}
              >
                {template.description}
              </ThemedText>
              <ThemedText
                selectable={false}
                type="note"
                themeColor={isComplete ? 'lumen' : 'textSecondary'}
              >
                {isComplete
                  ? `${slotCount}/${slotCount}컷 있음`
                  : `${filled}/${slotCount}컷 있음 · ${slotCount - filled}컷 더`}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  sectionHead: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bleed: { marginHorizontal: -PageGutter },
  row: { gap: Spacing.two, paddingHorizontal: PageGutter },
  card: {
    width: CardWidth,
    minHeight: 118,
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.one,
    justifyContent: 'space-between',
  },
  description: { flex: 1 },
});
