import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor, Typography, useTheme } from '@/shared/ui/theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'display'
    | 'title'
    | 'heading'
    | 'xsmall'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'eyebrow'
    | 'edge'
    | 'note'
    | 'button'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({
  selectable = true,
  style,
  type = 'default',
  themeColor,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      selectable={selectable}
      style={[
        styles.base,
        { color: theme.text },
        type === 'default' && styles.default,
        type === 'display' && styles.display,
        type === 'title' && styles.title,
        type === 'heading' && styles.heading,
        type === 'xsmall' && styles.xsmall,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'eyebrow' && styles.eyebrow,
        type === 'edge' && styles.edge,
        type === 'note' && styles.note,
        type === 'button' && styles.button,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.primary }],
        type === 'code' && styles.code,
        themeColor && { color: theme[themeColor] },
        style,
      ]}
      {...rest}
    />
  );
}

// Each variant is a step of `Typography` plus the things that make it a role —
// weight, letter spacing, casing. No variant writes a size or a leading of its
// own: those belong to the scale, and a role that needs different ones needs a
// new step there instead. The family comes from `base` and only the two
// mono-voiced roles name one at all.
const styles = StyleSheet.create({
  // Pretendard GOV under every role, so a variant declares a family only to
  // leave it — `edge` and `code` do, for the system monospace. Callers' `style`
  // still lands after this, and after the variant.
  base: { fontFamily: Fonts.sans },
  xsmall: { ...Typography.xsmall, fontWeight: 500 },
  small: { ...Typography.small, fontWeight: 500 },
  smallBold: { ...Typography.small, fontWeight: 700 },
  default: { ...Typography.body, fontWeight: 500 },
  display: { ...Typography.display, fontWeight: 800 },
  title: { ...Typography.title, fontWeight: 800 },
  subtitle: { ...Typography.subtitle, fontWeight: 700 },
  heading: { ...Typography.heading, fontWeight: 700 },
  eyebrow: {
    ...Typography.xsmall,
    fontWeight: 800,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  // Mono micro-stamp, for **Latin and digits only** — a bare count, a
  // percentage, `REC`, a ticking `12s`. The wide tracking is what makes those
  // read as stamped rather than typed.
  //
  // Do not put Hangul in an `edge` string. `Fonts.mono` has no Hangul face, so
  // every Korean glyph silently falls back to the OS CJK font (Noto Sans CJK on
  // Android, Apple SD Gothic Neo on iOS): the line is then neither monospaced
  // nor Pretendard, and the 2dp tracking — which is ~18% of an 11px Hangul
  // glyph, against ~30% of a Latin one — pushes the words apart far enough to
  // wrap. `uppercase` does nothing for it either. Korean micro-labels take
  // `note` instead; the two share `Typography.micro`, so they are one tier and
  // may sit in the same row.
  edge: {
    ...Typography.micro,
    fontFamily: Fonts.mono,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  // Sans micro-label — `edge`'s Korean-capable twin, and the app's default for
  // small states, counts, and durations that name a unit ("스냅 3개", "7.8초",
  // "4/6컷 · 2컷 더"). 700 rather than 500 because at 11px against
  // `textSecondary` a label has to hold its own without borrowing size, and a
  // token 0.2 of tracking keeps the denser Hangul syllables from touching.
  note: { ...Typography.micro, fontWeight: 700, letterSpacing: 0.2 },
  button: { ...Typography.body, fontWeight: 800 },
  // Links are body-small text, not a step of their own. They used to carry
  // lineHeight 30 at 14px (ratio 2.14) — the Expo starter's 16/30 with the size
  // cut and the leading left behind — and `link` declared no weight at all, so
  // it rendered at 400 against every neighbor's 500.
  link: { ...Typography.small, fontWeight: 500 },
  linkPrimary: { ...Typography.small, fontWeight: 700 },
  // Leading was missing here, which left it to the platform default: iOS
  // `ui-monospace` and Android `monospace` disagree, so the same inline code
  // changed its row height per platform.
  code: {
    ...Typography.xsmall,
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
  },
});
