import type { Href } from "expo-router";
import type { ComponentType, ReactNode } from "react";

/**
 * The four slots a module plugs into on this surface (`kit.gen.tsx` holds the lists; the
 * scaffold writes them from the manifest). Each is the mobile shape of the web's slot of
 * the same name.
 */

/**
 * What a gate answers on every render. A hook: it may read a query or a stored session.
 * `ready` is false while it is still deciding — the splash stays up and `index` renders
 * nothing; a pending gate answers `allow: false` too. `redirectTo` is where a refused user
 * goes; `index` follows the first gate that names one.
 */
export type GateResult = { ready: boolean; allow: boolean; redirectTo?: Href };

export type Gate = () => GateResult;

/** A row on the Settings tab: the label he reads, the work it does, and whether it is destructive. */
export type SettingsAction = {
  id: string;
  label: string;
  run: () => Promise<void> | void;
  tone?: "default" | "danger";
};

/** Wraps the whole app, inside the query client and the safe-area provider, outermost first. */
export type Provider = ComponentType<{ children: ReactNode }>;

/** Runs once before anything mounts — a mock-mode seed, an SDK init. A throw is logged, never fatal. */
export type Boot = () => Promise<void> | void;
