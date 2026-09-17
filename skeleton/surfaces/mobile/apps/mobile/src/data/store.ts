import { useSyncExternalStore } from "react";

/**
 * Client state: what the user did on this device. Only device-side state lives here — a
 * preference the server does not hold, where the user was — never a copy of server data,
 * which is React Query's, and never a secret. Client storage is read and written only
 * under `src/data`; a screen takes the value as a prop from its route.
 *
 * The same API as the web's `apps/web/src/data/store.ts`, over process memory: base ships
 * no storage dependency on the phone (the auth module brings `expo-secure-store` for its
 * session), so a launch starts from `EMPTY`. A persistent backing lands here and nowhere
 * else — `load()` at module scope and `set()` are the two seams the web's file has — and
 * every reader keeps going through `useAppState()`.
 */
export type AppState = {
  /** the last item opened on this device — the list marks it; a sample field, replace it with the product's own */
  lastVisitedItemId: string | null;
};

/**
 * EMPTY means empty. A fresh state is built FROM this object, so anything added to
 * `AppState` later starts at its default without anyone having to remember it.
 */
const EMPTY: AppState = {
  lastVisitedItemId: null,
};

let state: AppState = EMPTY;
const listeners = new Set<() => void>();

function set(next: AppState) {
  state = next;
  for (const fn of listeners) fn();
}

/** Wipe everything back to a first visit. */
export function resetAll() {
  set(EMPTY);
}

export function rememberVisitedItem(id: string) {
  if (state.lastVisitedItemId === id) return;
  set({ ...state, lastVisitedItemId: id });
}

export function getState(): AppState {
  return state;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}
