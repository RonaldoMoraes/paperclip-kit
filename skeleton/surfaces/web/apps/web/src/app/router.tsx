import { Navigate, createRouter } from "@tanstack/react-router";
import { RouteError } from "~/app/RouteError";
import { RoutePending } from "~/app/RoutePending";
import { routeTree } from "~/app/routeTree.gen";
import { queryClient } from "~/lib/queryClient";

/**
 * The router, and with it the app's loading contract.
 *
 * Every route waits the same way: nothing for the first 300ms, then `RoutePending` for at
 * least 300ms — long enough that a slow answer is acknowledged, short enough that a cached
 * one never blinks. No route overrides these.
 *
 * Staleness belongs to Query, so preloads read the cache instead of the network
 * (`defaultPreloadStaleTime: 0`), and every navigation starts at the top — a screen the
 * user has not seen has nothing to scroll through.
 */
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingComponent: RoutePending,
  defaultErrorComponent: RouteError,
  defaultPendingMs: 300,
  defaultPendingMinMs: 300,
  scrollRestoration: true,
  scrollRestorationBehavior: "instant",
  defaultNotFoundComponent: () => <Navigate to="/" replace />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
