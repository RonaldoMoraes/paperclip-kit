import type { Transition, Variants } from "motion/react";

/**
 * Motion tokens. Apple's fluid-interface model, translated: think in DAMPING (overshoot)
 * and RESPONSE (how fast it reaches the target) — never in "duration". Motion's `bounce` +
 * `duration` spring API maps onto those two.
 *
 * House rule: critically damped (bounce 0) everywhere by default. Bounce is earned only
 * when the gesture itself carried momentum — a flick, a drag release, a thing being
 * thrown. Overshoot on a menu that merely appeared reads as decoration; overshoot on a card
 * you flicked reads as physics.
 */

/** the brand curve, for the few places a tween is genuinely right — the number lives in `motion-tokens.ts`, which mobile reads too */
export { EASE } from "./motion-tokens";

/** default UI motion — damping 1.0, response 0.4 (Apple's "move / reposition") */
export const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.4 };

/** snappier, for small elements that must feel immediate */
export const SPRING_SNAP: Transition = { type: "spring", bounce: 0, duration: 0.26 };

/** momentum — damping ~0.8. Only after a gesture with velocity. */
export const SPRING_MOMENTUM: Transition = { type: "spring", bounce: 0.22, duration: 0.4 };

/** sheets and drawers — Apple ships damping 0.8 / response 0.3 here */
export const SPRING_SHEET: Transition = { type: "spring", bounce: 0.18, duration: 0.32 };

/* ── entrance choreography ──────────────────────────────────── */

/** a section arriving: stagger its children rather than moving as a slab */
export const stagger = (gap = 0.055, delay = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** the child of a staggered container — short travel, never a long slide */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: SPRING },
};

/** for cards that should read as arriving from depth rather than from below */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: SPRING },
};

/**
 * Translucent surfaces must MATERIALIZE, not fade: blur and scale move together so the
 * surface reads as a real material arriving. A plain opacity fade on a translucent panel
 * looks like a decal.
 */
export const materialize: Variants = {
  hidden: { opacity: 0, scale: 0.96, filter: "blur(12px)" },
  show: { opacity: 1, scale: 1, filter: "blur(0px)", transition: SPRING },
  exit: { opacity: 0, scale: 0.98, filter: "blur(8px)", transition: SPRING_SNAP },
};
