/**
 * Fills the `{braces}` in a copy string.
 *
 * The copy layer is edited by someone who is not going to reason about template literals,
 * so a value the app supplies travels as a named slot inside the sentence — which also
 * means the sentence can be reordered around it without touching this file.
 *
 * An unknown slot is left alone rather than blanked: a visible `{name}` on screen is a
 * typo anyone can spot, an empty gap is a bug nobody reports.
 */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
