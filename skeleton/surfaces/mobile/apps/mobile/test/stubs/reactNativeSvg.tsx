// react-native-svg ships Flow-typed native source that vitest cannot parse, and a mark
// has nothing to assert beyond its handle and its accessible name: the specs reach the
// button or the label, not the glyph.
import type { ReactNode } from "react";

type SvgProps = { children?: ReactNode; accessibilityLabel?: string; accessibilityRole?: string; testID?: string };

// `testID` lands as `data-testid`, the way react-native-web maps it, so a spec queries the
// mark here by the same id a device would expose.
export default function Svg({ children, accessibilityLabel, testID }: SvgProps) {
  return (
    <svg
      aria-label={accessibilityLabel}
      aria-hidden={accessibilityLabel ? undefined : "true"}
      role="img"
      data-testid={testID}
    >
      {children}
    </svg>
  );
}

export function Path() {
  return null;
}

export function Circle() {
  return null;
}

export { Svg };
