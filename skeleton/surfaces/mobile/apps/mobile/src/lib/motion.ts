import { Easing, FadeIn, FadeInDown, FadeInLeft, FadeInRight, Keyframe } from "react-native-reanimated";
import { EASE as EASE_POINTS, RISE, STAGGER } from "@ui/motion-tokens";

/**
 * The phone's half of the product's choreography, as Reanimated layout-animation builders.
 * Every number comes from `@ui/motion-tokens` (the shared defaults) or from the caller —
 * none is written here.
 *
 * The web's tokens are critically damped springs — no overshoot, response ~0.4 s — which
 * reads here as a tween on the brand curve; travel is short, never a long slide, so an
 * element arrives rather than flies in. Reanimated's builders are reduce-motion aware by
 * default (`ReduceMotion.System`), so nothing here gates on the OS setting.
 */

export const EASE = Easing.bezier(...EASE_POINTS);

/** the knobs of one staggered arrival, each field in its own unit */
export type Rise = { gapMs?: number; delayMs?: number; travelPx?: number; durationMs?: number };

/** the `order`th child of a staggered block — the web's `riseIn` under `stagger(gap, delay)` */
export const riseIn = (
  order: number,
  {
    gapMs = STAGGER.gapMs,
    delayMs = STAGGER.delayMs,
    travelPx = RISE.travelPx,
    durationMs = RISE.durationMs,
  }: Rise = {}
) =>
  FadeInDown.duration(durationMs)
    .easing(EASE)
    .delay(delayMs + order * gapMs)
    .withInitialValues({ opacity: 0, transform: [{ translateY: travelPx }] });

/** a fade with no travel, `delayMs` in */
export const fadeIn = (delayMs: number, durationMs = RISE.durationMs) =>
  FadeIn.duration(durationMs).easing(EASE).delay(delayMs);

/** the knobs of one sideways arrival — `travelX` is signed, negative coming from the left */
export type Slide = { gapMs?: number; delayMs?: number; travelX?: number; durationMs?: number };

/** the `order`th child of a block that arrives from the side rather than from below */
export const slideIn = (
  order: number,
  {
    gapMs = STAGGER.gapMs,
    delayMs = STAGGER.delayMs,
    travelX = -RISE.travelPx,
    durationMs = RISE.durationMs,
  }: Slide = {}
) =>
  // The builder has to match the sign: FadeInLeft/FadeInRight each animate translateX back
  // to 0 from their own side, and the initial values only set where that starts.
  (travelX < 0 ? FadeInLeft : FadeInRight)
    .duration(durationMs)
    .easing(EASE)
    .delay(delayMs + order * gapMs)
    .withInitialValues({ opacity: 0, transform: [{ translateX: travelX }] });

/** something arriving from depth — a card, a check mark on a picked option */
export type Pop = { fromScale: number; travelPx?: number; durationMs: number; delayMs?: number };

export const popIn = ({ fromScale, travelPx = 0, durationMs, delayMs = 0 }: Pop) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ scale: fromScale }, { translateY: travelPx }] },
    100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }], easing: EASE },
  })
    .duration(durationMs)
    .delay(delayMs);
