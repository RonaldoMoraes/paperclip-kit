/**
 * The wait between one code and the next — the decision both apps make the same way,
 * with no clock and no React: what a settled send earns, how long is left, and what a
 * button says while the wait runs. Each app keeps its own countdown around these.
 */
import type { AuthErrorKind } from "./errors";

/**
 * Long enough to stop a row of taps becoming a row of emails, short enough that a code
 * which never arrived is not a punishment.
 */
export const SEND_COOLDOWN_SECONDS = 30;

/** What a send settled as: `null` when it went out, the kind of refusal otherwise. */
export type SendOutcome = AuthErrorKind | null;

/**
 * The wait follows a send that reached the server: one that went out, and one the server
 * refused for coming too fast — that refusal is the only one a person answers by waiting,
 * and handing the buttons straight back would put them back on the endpoint that just
 * said no. A send that never left the device is not a wait anyone gains from.
 */
export function waitFollowsSend(outcome: SendOutcome): boolean {
  return outcome === null || outcome === "throttle";
}

/** When a wait started at `now` ends, on the same clock. */
export function sendCooldownEnd(now: number): number {
  return now + SEND_COOLDOWN_SECONDS * 1_000;
}

/** Whole seconds until `endsAt`, rounded up so the count never shows 0 with time left. */
export function secondsUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1_000));
}

/**
 * The wait carries its own label: a button that only greys out reads as broken, where a
 * countdown reads as an answer. Both apps print it through here so the copy cannot drift.
 */
export function waitLabel(label: string, secondsLeft: number): string {
  return secondsLeft > 0 ? `${label} in ${secondsLeft}s` : label;
}
