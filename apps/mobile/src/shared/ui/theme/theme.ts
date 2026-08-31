import { Platform } from 'react-native';

// One warm-neutral world in two schemes. Both palettes share the ember accent
// and the same near-black `media` ground — video reads better against
// near-black regardless of theme, so surfaces that hold video never lighten.
// The dark palette is the original; the light palette answers it in warm
// paper tones (same brown family, inverted roles) rather than neutral gray,
// so switching schemes changes brightness, not identity.
const darkPalette = {
  text: '#F1E6DA', // ink — warm off-white
  background: '#16110D', // ground — warm black-brown, not pure black
  backgroundElement: '#211910', // surface
  backgroundSelected: '#2C2118', // surface raised
  textSecondary: '#A8927E', // ink dim
  // Unselected tab glyph — the one role that leaves the warm axis. The tab bar
  // is the only place the app's ink sits directly beside the Android system
  // navigation glyphs, which the OS draws neutral and will not let an app tint
  // (Android 15+ offers a light/dark bit and nothing more). Against those, a
  // warm `textSecondary` reads as a color mismatch rather than as a palette. So
  // this drops the hue while keeping `textSecondary`'s exact relative luminance
  // (Y=0.304): contrast against the ground is untouched, only the warmth is
  // gone. The light scheme does not need the same move — see below.
  tabInactive: '#969696',
  border: '#3A2C20', // line
  primary: '#EA5E38', // ember — main accent, capture
  onPrimary: '#1A0F0A', // ink on ember (dark, high contrast)
  ai: '#82D6CE', // lumen — cold glow, used for AI/generation
  media: '#0E0B08', // near-black behind video: frames, viewfinder
  warmSurface: '#241A12', // raised warm panel, for notices
  danger: '#F26D6D',
  amber: '#E7A24A', // warm secondary accent
  lumen: '#82D6CE', // cold contrast axis
} as const;

// Cold-axis and status colors darken in the light scheme so small text and
// glyphs keep ≥4.5:1 against the paper ground; ember stays the one shared
// brand constant (it is a fill with dark ink on top, not body text).
const lightPalette = {
  text: '#241A12', // ink — warm near-black
  background: '#FAF4EC', // ground — warm paper
  backgroundElement: '#FFFDF9', // surface — card over paper
  backgroundSelected: '#F0E6D9', // surface raised
  textSecondary: '#75604F', // ink dim
  // Unselected tab glyph, deliberately the same warm ink as `textSecondary`
  // here. The neutral swap the dark scheme makes buys nothing on paper: the OS
  // draws its navigation glyphs dark over a light shell, so they never clashed
  // with the warm ink to begin with, and going neutral only left the tab bar
  // colder than the headings beside it. Compared on device before deciding.
  tabInactive: '#75604F',
  border: '#E7DCCC', // line
  primary: '#EA5E38', // ember — main accent, capture
  onPrimary: '#1A0F0A', // ink on ember (dark, high contrast)
  ai: '#147D74', // lumen — cold glow, used for AI/generation
  media: '#0E0B08', // near-black behind video: frames, viewfinder
  warmSurface: '#F3E9DB', // raised warm panel, for notices
  danger: '#C43D3D',
  amber: '#9C6520', // warm secondary accent
  lumen: '#147D74', // cold contrast axis
} as const;

export const Colors = {
  light: lightPalette,
  dark: darkPalette,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The app's two families. `sans` is Pretendard GOV — the app's voice, and the
 * only family for prose, headings, and controls; `mono` is the system
 * monospace, kept for the `edge`/`code` micro-labels, since Pretendard ships no
 * monospaced face.
 *
 * **The system monospace has no Hangul.** Neither `ui-monospace` nor Android's
 * `monospace` carries a Korean face, so a Korean string styled with `mono` is
 * drawn by the OS CJK fallback instead — a third family, matching neither the
 * app's voice nor the monospace it asked for. That is why `mono` belongs only
 * to Latin-and-digit stamps; Korean micro-labels use the sans `note` role.
 *
 * Pretendard GOV is embedded natively by the `expo-font` plugin in `app.json`,
 * not loaded with `useFonts`, so it is there on the first frame: no gate in the
 * root layout and no flash of a fallback face. One family name covers every
 * weight on both platforms — iOS groups the faces by their typographic family
 * (name ID 16, `Pretendard GOV` in every file), Android by the font-family XML
 * the plugin generates from `fontDefinitions` — so `fontFamily` pairs with
 * `fontWeight` and no style ever names a single face.
 *
 * `assets/fonts` holds exactly the four weights the type roles below use (400,
 * 500, 700, 800) and nothing else, because each face is ~5MB of app binary. A
 * weight outside that set resolves to the nearest embedded face, and **600
 * lands exactly between 500 and 700** — a tie iOS breaks toward 500 — so treat
 * the four as the whole set rather than reaching for a weight that only
 * half-renders.
 *
 * The `web` branch is a courtesy for `npm run web`, not a product surface: the
 * app ships to iOS and Android only, so no webfont is served and a browser
 * falls back down the `--font-body` stack in `global.css`.
 */
export const Fonts = Platform.select({
  ios: {
    sans: 'Pretendard GOV',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Pretendard GOV',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-body)',
    mono: 'var(--font-mono)',
  },
});

/**
 * The type scale — one entry per size step, each pairing a size with its
 * leading. `ThemedText` maps its `type` names onto these steps and adds only
 * what makes a role: family, weight, letter spacing, casing. Text that cannot
 * be a `ThemedText` (a `TextInput`, a glyph drawn over video) still takes its
 * size from here rather than inlining a literal.
 *
 * Sizes step about 1.25× from `heading` up (21 → 26 → 32 → 42) and tighten
 * below it (11 → 12 → 14 → 16); they follow the ratio, not a grid.
 *
 * Every leading, on the other hand, is a multiple of 4, so a row's height stays
 * predictable and stacked text keeps a vertical rhythm. Within that grid the
 * leading is loosest where text wraps and is read as prose (1.43–1.5 at 14–16px)
 * and tightens as the type grows (1.25 at `title`, 1.14 at `display`), because
 * large type reads as gappy at body leading. `micro` and `xsmall` share 16: it is
 * the smallest grid step that clears 12px, which makes 11px the looser of the two
 * by arithmetic rather than by choice.
 */
export const Typography = {
  micro: { fontSize: 11, lineHeight: 16 },
  xsmall: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 24 },
  heading: { fontSize: 21, lineHeight: 28 },
  subtitle: { fontSize: 26, lineHeight: 32 },
  title: { fontSize: 32, lineHeight: 40 },
  display: { fontSize: 42, lineHeight: 48 },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
  eight: 64,
} as const;

export const Radius = {
  xsmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 24,
  pill: 999,
} as const;

export const MaxContentWidth = 680;
