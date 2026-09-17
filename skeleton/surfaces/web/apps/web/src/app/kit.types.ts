import type { QueryClient } from "@tanstack/react-query";
import type { ParsedLocation } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";

/**
 * The slots a module plugs into, as types. `kit.gen.tsx` beside this file is the generated
 * list of what the scaffold wired; nothing here is edited by a module.
 */

/** the router context every route reads */
export type AppRouterContext = { queryClient: QueryClient };

/**
 * What the gates grant to the routes under `_app`: the merge of what every `Gate` returned,
 * read as `Route.useRouteContext()` there. Empty in base; a module names what its gate
 * grants by augmenting this interface from its own files —
 * `declare module "~/app/kit.types" { interface GateContext { session: SessionRecord } }` —
 * so a route under the layout reads a typed `context.session`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by modules, empty by design in base
export interface GateContext {}

/**
 * A gate runs in `_app.tsx`'s `beforeLoad`, in the order the scaffold listed them. It
 * returns what the routes under it may read from the router context (a session, an
 * entitlement), or throws `redirect` to send the user somewhere else first.
 */
export type Gate = (ctx: {
  queryClient: QueryClient;
  location: ParsedLocation;
  // biome-ignore lint/suspicious/noConfusingVoidType: the contract — a gate that grants nothing returns nothing
}) => Promise<Record<string, unknown> | void>;

/** wraps the router — a context the module's hooks read */
export type Provider = ComponentType<{ children: ReactNode }>;

/** runs once before the first render, after the mock worker (an SDK init, a flag fetch) */
export type Boot = () => Promise<void> | void;

/** one row on the settings screen: the module owns what happens, the screen owns how it looks */
export type SettingsAction = {
  id: string;
  label: string;
  run: () => Promise<void> | void;
  tone?: "default" | "danger";
};
