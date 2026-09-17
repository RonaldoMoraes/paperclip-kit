import type { ReactNode } from "react";
import { Text } from "react-native";

/**
 * Renders a copy string's inline marks — the two the copy layer uses (`@domain/copy`):
 * `*asterisks*` for the brand's accent and `**double asterisks**` for bold — as nested
 * Text, the phone's half of the web's `withMarks`. The classes are the screen's to pass,
 * because the same mark dresses differently per surface (the brand ink on the light page,
 * the accent over a dark one); plain text comes back untouched. The result renders inside
 * a `Text`, never bare: a native string outside one crashes on device.
 */
export function withMarks(text: string, classes: { em?: string; strong?: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((part) => part !== "");
  if (parts.length === 1 && !parts[0].startsWith("*")) return text;
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        // the copy string is static per screen — position is the segment's identity
        <Text key={index} className={classes.strong}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <Text key={index} className={classes.em}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}
