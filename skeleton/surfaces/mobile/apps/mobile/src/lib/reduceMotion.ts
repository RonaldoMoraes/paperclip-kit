import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export const READ_DEADLINE_MS = 500;

/**
 * The OS's reduce-motion setting: `null` until the first read lands, then the setting.
 *
 * Reanimated reads an `entering` animation once, when the element attaches, so a caller
 * must hold animated content back while this is `null` — content mounted before the read
 * lands animates whatever the setting turns out to say.
 */
export function useReduceMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;

    // Never leave it unread: callers gate their content on it, so a refused — or silent —
    // read has to settle anyway, and motion is the recoverable wrong answer.
    const settled = setTimeout(() => {
      if (live) setReduced((current) => current ?? false);
    }, READ_DEADLINE_MS);

    const read = async () => {
      try {
        const on = await AccessibilityInfo.isReduceMotionEnabled();
        if (live) setReduced(on);
      } catch {
        if (live) setReduced(false);
      }
    };

    read();
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      clearTimeout(settled);
      subscription?.remove();
    };
  }, []);

  return reduced;
}
