/**
 * The shell's destinations, as both apps declare them.
 *
 * Data only — no React, no icons: the web draws a `lucide-react` glyph behind a router
 * link and the phone a `lucide-react-native` one behind a navigator route, and neither of
 * those belongs to the other. What is shared is which destinations there are, in which
 * order, and where each lives, because a bar that offers two on one platform and three on
 * the other is one product wearing two shells. Labels are `SHELL_COPY.tabs`.
 */

/** Two destinations in base: the example feature and settings. A product adds its own here. */
export const TAB_NAMES = ["example", "settings"] as const;

export type TabName = (typeof TAB_NAMES)[number];

/**
 * Where each destination lives — the path both routers serve it under, as a literal so
 * the web's `Link` checks it against the route tree. A detail page sits inside its list
 * (`/example/<id>`), so a bar lights the destination whose path prefixes the current one.
 */
export const TAB_DESTINATIONS = {
  example: "/example",
  settings: "/settings",
} as const satisfies Record<TabName, `/${string}`>;

/** A route name is only a destination if the shell actually has one for it. */
export function isTabName(name: string | undefined): name is TabName {
  return TAB_NAMES.some((tab) => tab === name);
}
