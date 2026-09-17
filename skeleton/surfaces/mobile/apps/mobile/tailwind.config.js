/** @type {import('tailwindcss').Config} */
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const withVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

// The theme is the web app's when the web surface is present — one palette, one set of
// names, both renderers. Only its THEME: the web config's content globs point at
// index.html and the DOM app, and reusing them here would compile the wrong classes.
// Without a web app the same names are declared here over shared/ui/tokens.css, so a
// class a screen wears resolves the same way whichever surface the product ships.
const WEB_CONFIG = join(__dirname, "../web/tailwind.config.js");
const OWN_THEME = {
  // Replace, never extend, the palette: every colour goes through tokens.css.
  colors: {
    transparent: "transparent",
    current: "currentColor",
    white: withVar("white"),
    black: withVar("black"),
    canvas: withVar("bg-canvas"),
    surface: { DEFAULT: withVar("bg-surface"), subtle: withVar("bg-surface-subtle") },
    brand: { DEFAULT: withVar("bg-brand"), strong: withVar("bg-brand-strong") },
    immersive: withVar("bg-immersive"),
    ink: {
      DEFAULT: withVar("fg-primary"),
      secondary: withVar("fg-secondary"),
      tertiary: withVar("fg-tertiary"),
      brand: withVar("fg-brand"),
    },
    ondark: { DEFAULT: withVar("fg-on-dark"), muted: withVar("fg-on-dark-muted") },
    line: { DEFAULT: withVar("border-default"), subtle: withVar("border-subtle") },
    error: withVar("feedback-error"),
    success: withVar("feedback-success"),
    ring: withVar("focus-ring"),
  },
  extend: {
    // The radius system is 8 / 16 / 40 / full; `sheet` sits at 20 as the one interpolation.
    borderRadius: { card: "16px", sheet: "20px", pill: "40px" },
  },
};
const theme = existsSync(WEB_CONFIG) ? require(WEB_CONFIG).theme : OWN_THEME;

module.exports = {
  presets: [require("nativewind/preset"), { theme }],
  content: [
    join(__dirname, "app/**/*.{ts,tsx}"),
    join(__dirname, "src/**/*.{ts,tsx}"),
    join(__dirname, "../../shared/ui/**/*.{ts,tsx}"),
  ],
  theme: {
    extend: {
      // Native has no font stack and no synthetic bold: a family is one file, registered
      // under the name the root layout gave `useFonts`. `font-sans` is the regular cut;
      // every other weight is its own key, because `font-bold` only sets a fontWeight,
      // which a single-cut family cannot answer.
      //
      // Under `extend`, not `theme.fontFamily`: nativewind/preset declares `sans`, `serif`
      // and `mono` in its own `extend`, and Tailwind lays every `extend` over the base
      // theme, so a base-level `sans` loses to the preset's system font.
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
      },
      // A fluid web scale (`clamp()`) does not resolve on native and fails silently: the
      // same names, fixed at the phone end. Line-heights run looser than the web's, because
      // Android clips a glyph to its line box. Native letter-spacing is absolute, so an em
      // value is multiplied out against its own size — except at the small end, where it
      // is dropped: Android under-measures a custom face when letterSpacing is set and
      // clips the last character of any label sized to its own text.
      fontSize: {
        "display-1": ["40px", { lineHeight: "48px", letterSpacing: "-0.56px" }],
        "display-2": ["32px", { lineHeight: "40px", letterSpacing: "-0.35px" }],
        "title-1": ["24px", { lineHeight: "30px", letterSpacing: "-0.19px" }],
        "title-2": ["20px", { lineHeight: "26px", letterSpacing: "-0.1px" }],
        micro: ["11px", { lineHeight: "14px" }],
      },
    },
  },
  plugins: [],
};
