import { Outlet, createFileRoute } from "@tanstack/react-router";
import { KIT_GATES } from "~/app/kit.gen";
import type { GateContext } from "~/app/kit.types";
import { TabShell } from "~/features/shell/components/TabShell";

/**
 * The shelled app: every destination under here renders inside `TabShell` (top bar, tab
 * bar) and behind every gate a module contributed. Pathless — the layout adds no URL
 * segment.
 *
 * The gates run in `beforeLoad`, in order, before anything renders: a gate that turns the
 * user away throws `redirect`, and what the others return is merged into the router
 * context so a route under here reads the decision that let it render (a session, an
 * entitlement) instead of asking for it again. Base ships no gate; the example routes are
 * public until a module says otherwise.
 *
 * A screen that must NOT carry the shell — a full-viewport ritual, a sign-in — sits beside
 * this layout as a direct child of `__root`, not under it.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    // Typed by the modules that grant it (`GateContext`), never by this file: an open
    // record here would erase `queryClient` from every child route's context type, and
    // asserting one straight to `GateContext` stops compiling the moment a module
    // augments the interface with a required member (`session`) — an interface gets no
    // implicit index signature, so neither type is comparable to the other (TS2352).
    // `Partial<GateContext>` is comparable in both directions and stays so at zero, one
    // or several augmentations: it is the accumulator while it fills, and the assertion
    // at the end is the claim that every gate ran.
    const merged: Partial<GateContext> = {};
    for (const gate of KIT_GATES) {
      const granted = await gate({ queryClient: context.queryClient, location });
      if (granted) Object.assign(merged, granted);
    }
    return merged as GateContext;
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <TabShell>
      <Outlet />
    </TabShell>
  );
}
