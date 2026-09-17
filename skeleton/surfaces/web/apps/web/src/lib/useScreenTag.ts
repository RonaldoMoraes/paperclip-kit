import { useEffect } from "react";

/**
 * Marks which screen is on stage. The e2e suite reads this global (`expectScreenTag`) to
 * assert a screen by identity instead of by copy, which i18n translates.
 */
declare global {
  interface Window {
    __appScreen?: string;
  }
}

export function useScreenTag(tag: string) {
  useEffect(() => {
    window.__appScreen = tag;
  }, [tag]);
}
