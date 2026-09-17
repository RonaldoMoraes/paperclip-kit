import { useSyncExternalStore } from "react";

/**
 * What this launch has already done. Process lifetime, never persisted: a flag here is
 * about the app opening, so it holds once per launch and not once per install, and it
 * outlives a remount of the route that set it — a gate flipping remounts `index`, and that
 * is not the app opening again.
 *
 * `splash-hidden` is the root layout's: the native splash has come down, so anything that
 * plays "once per launch" may start. A module adds its own flag to the union.
 */
export type LaunchFlag = "splash-hidden";

const done = new Set<LaunchFlag>();
const listeners = new Set<() => void>();

export function markLaunchDone(flag: LaunchFlag) {
  if (done.has(flag)) return;
  done.add(flag);
  for (const fn of listeners) fn();
}

export function isLaunchDone(flag: LaunchFlag): boolean {
  return done.has(flag);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useLaunchDone(flag: LaunchFlag): boolean {
  return useSyncExternalStore(subscribe, () => done.has(flag));
}

/** Specs only: back to a fresh launch. */
export function resetLaunchForTest() {
  done.clear();
}
