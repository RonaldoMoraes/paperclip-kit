/**
 * The motion numbers both renderers read — durations in ms, travel in points, springs as
 * Reanimated's stiffness/damping pair. Nothing platform-specific: no `motion/react` import,
 * no Reanimated import, so either side can take a value from here.
 *
 * `motion.ts` beside it is the web's motion/react shapes over these numbers;
 * `apps/mobile/src/lib/motion.ts` is the phone's Reanimated builders over them.
 */

/** the brand curve as cubic-bezier control points */
export const EASE = [0.2, 0, 0, 1] as const;

/** a critically damped spring at response 0.4 s, as the tween a renderer without springs plays: brand curve, 400 ms */
export const SPRING_MS = 400;

/** the child of a staggered block: short travel, never a long slide */
export const RISE = { travelPx: 14, durationMs: SPRING_MS } as const;

/** a section arriving: the gap between its children and the wait before the first */
export const STAGGER = { gapMs: 55, delayMs: 40 } as const;

/** a pressed control: the web's active:scale-[0.985] under transition-transform duration-150 */
export const TAP = { scale: 0.985, durationMs: 150 } as const;

/**
 * One step of a flow replacing the next (the web's AnimatePresence mode="wait"): the
 * outgoing one leaves over `durationMs` rising to `exitY`, then the next rises from
 * `enterY` over `durationMs`.
 */
export const STEP_TRANSITION = { durationMs: 300, enterY: 24, exitY: -16 } as const;

/** a progress bar following the step */
// Every spring states its mass: the web's motion/react assumes 1 and Reanimated 4 fills in GentleSpringConfig's 4, so an unstated mass plays a spring twice as slow to settle on the phone.
export const PROGRESS_SPRING = { stiffness: 170, damping: 26, mass: 1 } as const;

/** a check mark popping in on a picked option */
export const CHECK_SPRING = { stiffness: 500, damping: 24, mass: 1 } as const;

/** a line ticking off */
export const TICK_SPRING = { stiffness: 400, damping: 20, mass: 1 } as const;
