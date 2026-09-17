/** @type {import('tailwindcss').Config} */
const { join } = require("node:path");
const withVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  // join(__dirname): Tailwind v3 resolves content globs from the CWD, and this app runs
  // from the product root — bare relative globs would scan the server's src/ instead.
  content: [
    join(__dirname, "index.html"),
    join(__dirname, "src/**/*.{ts,tsx}"),
    join(__dirname, "../../shared/ui/**/*.{ts,tsx}"),
  ],
  theme: {
    // Deliberately replace (not extend) the color palette: the default Tailwind palette is
    // banned — every color goes through tokens.css. Primitives are listed for the few
    // decorative uses (a wash, a tint); everything with a job reads a semantic name.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      // primitives
      white: withVar("white"),
      black: withVar("black"),
      gray: {
        50: withVar("gray-050"),
        100: withVar("gray-100"),
        200: withVar("gray-200"),
        300: withVar("gray-300"),
        500: withVar("gray-500"),
        600: withVar("gray-600"),
        800: withVar("gray-800"),
        900: withVar("gray-900"),
        950: withVar("gray-950"),
      },
      accent: {
        100: withVar("accent-100"),
        500: withVar("accent-500"),
        700: withVar("accent-700"),
        900: withVar("accent-900"),
      },
      amber: { 500: withVar("amber-500") },
      // semantic
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
      ondark: {
        DEFAULT: withVar("fg-on-dark"),
        muted: withVar("fg-on-dark-muted"),
        accent: withVar("fg-accent-on-dark"),
      },
      line: { DEFAULT: withVar("border-default"), subtle: withVar("border-subtle") },
      error: withVar("feedback-error"),
      success: withVar("feedback-success"),
      ring: withVar("focus-ring"),
    },
    fontFamily: {
      // system stacks until the brand picks its faces; `index.html` is where a webfont loads
      serif: ["ui-serif", "Georgia", "serif"],
      sans: ["system-ui", "-apple-system", "sans-serif"],
    },
    extend: {
      spacing: {
        // The floating chrome's geometry, named once so the bars and the screens that must
        // clear them agree. `tab-clear` is the bottom padding every shelled screen reserves:
        // safe area + 6rem, so the last line clears the bar.
        "safe-top": "env(safe-area-inset-top)",
        "bar-lift": "max(env(safe-area-inset-bottom), 0.75rem)",
        "tab-clear": "calc(env(safe-area-inset-bottom) + 6rem)",
        // The top bar's own height, for a screen that has to stick something directly
        // under it. `TopBar` is `h-14` over the safe area.
        "bar-clear": "calc(env(safe-area-inset-top) + 3.5rem)",
      },
      fontSize: {
        // Fluid on purpose: a headline that is 2.5rem on a phone is undersized on a 27"
        // display, and the hierarchy flattens. Tracking is SIZE-SPECIFIC: display sizes
        // tighten, the small end opens up. The lint bans arbitrary px above 24 so display
        // type always comes from these.
        "display-1": ["clamp(2.5rem, 4.6vw, 4rem)", { lineHeight: "1.06", letterSpacing: "-0.014em" }],
        "display-2": ["clamp(2rem, 3.2vw, 3rem)", { lineHeight: "1.12", letterSpacing: "-0.011em" }],
        "title-1": ["clamp(1.5rem, 2vw, 2rem)", { lineHeight: "1.18", letterSpacing: "-0.008em" }],
        "title-2": ["clamp(1.25rem, 1.5vw, 1.5rem)", { lineHeight: "1.28", letterSpacing: "-0.005em" }],
        micro: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.01em" }],
      },
      borderRadius: {
        // The radius system is 8 / 16 / 40 / full; `sheet` sits at 20 as the one
        // interpolation, so a card and a large surface stay distinct.
        card: "16px",
        sheet: "20px",
        pill: "40px",
      },
      boxShadow: {
        // ink-tinted elevation — never plain black
        soft: "0 2px 12px rgb(var(--fg-primary) / 0.05), 0 10px 36px rgb(var(--fg-primary) / 0.08)",
        lift: "0 16px 48px rgb(var(--fg-primary) / 0.16)",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.2, 0, 0, 1)",
        out: "cubic-bezier(0, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};
