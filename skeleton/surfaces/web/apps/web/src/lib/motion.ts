import type { MotionProps } from "motion/react";
import { EASE, stagger } from "@ui/motion";

export * from "@ui/motion";

/**
 * Motion for the web app. The tokens — `EASE`, the springs, `stagger`/`riseIn` — come from
 * `shared/ui`; what is added here is how a SCREEN arrives. The `Screen` shell applies one
 * of these three, so no screen composes an enter animation of its own.
 */

/** the page arriving as one block: main rises, the field stays put */
export const pageEnter = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE },
} satisfies MotionProps;

/** the page arriving by staggering its own children instead of moving as a slab */
export const staggerEnter = (gap?: number, delay?: number) =>
  ({ initial: "hidden", animate: "show", variants: stagger(gap, delay) }) satisfies MotionProps;

/** the page arriving without moving — for a screen whose sticky chrome must not slide with it */
export const fadeEnter = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.35, ease: EASE },
} satisfies MotionProps;
