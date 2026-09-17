# shared/ui

The design system both apps consume: components with `.native.tsx` variants beside them,
`tokens.css`, `base.css` (resets, focus, the card and chrome materials), `motion.ts` and
`cn.ts`. A component earns its place by repeating across features; until then the block
stays in the screen. A module that renders DOM or reads `motion/react` at runtime is
web-only, and nothing under `shared/ui` may import from an app
([`ui-app-boundary.grit`](../biome/ui-app-boundary.grit)).

## Tokens

[`tokens.css`](../shared/ui/tokens.css) is the only place a color is defined: primitives
as RGB channels (never flip), and a semantic layer (`--bg-*`, `--fg-*`, `--border-*`,
`--feedback-*`, `--focus-ring`) that flips under `prefers-color-scheme: dark`. Tailwind's
palette is replaced, not extended (`apps/web/tailwind.config.js`), so every class reads a
token through `rgb(var(--x) / <alpha-value>)`. The shipped palette is a neutral placeholder:
change the primitives, keep the semantic names.

## base.css

The focus ring (`:focus-visible` as a box-shadow that follows the radius, with a canvas
halo; the immersive surface swaps the halo), `.tnum` for numbers, `.lede` for emphasis in a
paragraph, `.card` (surface + hairline, no shadow — the system is flat) and `.chrome` (the
floating bars' translucent material, solid under `prefers-reduced-transparency` and
`prefers-contrast`), and the print rules. Reduced motion is answered per component through
Motion's `reducedMotion="user"`; the CSS transitions answer it in `base.css`.

## Accessibility lives in the primitive

A screen inherits its semantics from the primitives it composes and never re-implements
them. A primitive written or changed here owes:

- **Keyboard operation**: Tab reaches it, Enter/Space activate it; a composite widget
  follows its WAI-ARIA APG pattern (roving arrows, Home/End, `role` and `aria-*` state).
  A `div` with `onClick` is not a button.
- **The designed focus ring**, once, in `base.css`; never suppressed or restyled per
  element ([`focus-ring.grit`](../biome/focus-ring.grit)). A dark surface adapts it
  through its surface class.
- **Touch targets** of at least 44×44px of hit area — pad the target, not the icon.
- **Announcements**: `role="status"` on a confirmation, `role="alert"` on an error, owned
  by the primitive that owns the message (`ScreenPending` is an `<output>`).
- **Native parity**: the `.native.tsx` variant mirrors the semantics with
  `accessibilityRole`, `accessibilityState` and a label; `testID` is the web
  `data-testid` name. `buttonVariants.ts` holds the grammar both `Button` files satisfy.
- **Overlays**: `role="dialog"`, `aria-modal`, labelled by the visible title, a visible
  close control; focus moves in, cycles, Escape closes, focus returns; the background is
  inert and overlays never stack. A message that needs no answer is a toast, not a modal.
- **Hover hides nothing critical**; a tooltip also shows on focus and is linked by
  `aria-describedby`.

A primitive's unit spec is where a lost role or label fails: it asserts the accessible
name where that is the claim and drives keyboard operation with `userEvent.keyboard`,
because e2e locates by testid for i18n's sake and cannot catch a lost name. A `.native.tsx`
variant's spec is `*.native.spec.tsx` beside it, under `yarn test:mobile`.
