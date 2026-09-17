import { useSyncExternalStore } from "react";

/**
 * Client state, localStorage-backed: what the user did on this device. Only device-side
 * state lives here — a preference the server does not hold, where the user was — never a
 * copy of server data, which is React Query's, and never a secret.
 */
export type AppState = {
  /** the last item opened on this device — the list marks it; a sample field, replace it with the product's own */
  lastVisitedItemId: string | null;
};

/**
 * The versioned key. `load()` spreads a parse over `EMPTY`, so an added field defaults on
 * its own; a field whose SHAPE or meaning changes bumps the version here and, when the old
 * data is worth keeping, migrates it in `load()`.
 */
const KEY = "__PRODUCT_SLUG__-state-v1";

/**
 * EMPTY means empty. A fresh state is built FROM this object, so anything added to
 * `AppState` later starts at its default without anyone having to remember it.
 */
const EMPTY: AppState = {
  lastVisitedItemId: null,
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<AppState>) };
  } catch {
    /* fall through to empty */
  }
  return EMPTY;
}

let state: AppState = load();
const listeners = new Set<() => void>();

function set(next: AppState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — in-memory only */
  }
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

export function useAppState(): AppState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state
  );
}
