import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import type { AppRouterContext } from "~/app/kit.types";

/**
 * Both devtools, side by side: the router's for the match tree and its pending/error
 * states, Query's for the caches those routes load from — most questions here start as
 * "which of the two is holding this screen".
 *
 * `import.meta.env.DEV` is a build-time constant — `vite.config.ts` pins it to the build's
 * mode — so a production bundle keeps the `() => null` branch and emits neither chunk.
 */
const RouterDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-router-devtools").then((m) => ({ default: m.TanStackRouterDevtools })))
  : () => null;

const QueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null;

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      <Suspense fallback={null}>
        <RouterDevtools />
        <QueryDevtools />
      </Suspense>
    </>
  );
}
