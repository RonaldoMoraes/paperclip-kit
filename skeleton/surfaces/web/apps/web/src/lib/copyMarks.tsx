import type { ReactNode } from "react";

/**
 * Renders a copy string's inline marks — the two the copy layer uses (`@domain/copy`):
 * `*asterisks*` for the brand's accent and `**double asterisks**` for bold. The classes
 * are the screen's to pass, because the same mark dresses differently per surface (the
 * brand ink on the light page, the accent over a dark one); plain text comes back untouched.
 */
export function withMarks(text: string, classes: { em?: string; strong?: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((part) => part !== "");
  if (parts.length === 1 && !parts[0].startsWith("*")) return text;
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        // the copy string is static per screen — position is the segment's identity
        <strong key={index} className={classes.strong}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={index} className={classes.em}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
