import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { KNOWN_ROUTES } from "./routes";

/**
 * The probe's testid for a route: `/example` → `route-example`, `/example/$id` →
 * `route-example-$id`, the index route → `route-index`.
 */
export const routeTestId = (path: string) => `route${path === "/" ? "-index" : path.replaceAll("/", "-")}`;

/** A stand-in for a screen: says which route it is. */
function RouteProbe({ path }: { path: string }) {
  return <span data-testid={routeTestId(path)}>ROUTE:{path}</span>;
}

/**
 * Mounts a screen at its route with probe elements on every other route, so a spec can
 * assert navigation by looking for `route-target` instead of mocking the router. Reduced
 * motion keeps springs from leaving the DOM mid-assert, and a fresh query client per render
 * (no retries) keeps a rejected request a rejected request.
 *
 * The tree is a stand-in for `app/routes/**`, not a copy of it: the same paths, read from
 * the generated route tree, with no loaders and no gates — so a screen spec exercises the
 * screen and nothing else.
 *
 * `entry` is a path, with the search a gate would have attached to it where that is the
 * point: a spec that means to arrive the way the user arrives writes that query string out.
 *
 * Async, because the router is: `RouterProvider` resolves its first match in an effect, so
 * a spec that asserted straight after `render` would be looking at an empty document.
 * Awaiting here is what keeps the assertions themselves plain.
 */
export async function renderAt(entry: string, element: ReactNode) {
  const bare = entry.split("?")[0];
  const paths = KNOWN_ROUTES.includes(bare) ? KNOWN_ROUTES : [...KNOWN_ROUTES, bare];

  const rootRoute = createRootRoute();
  const routes = paths.map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: path === bare ? () => <>{element}</> : () => <RouteProbe path={path} />,
    })
  );

  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [entry] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="always">
        <RouterProvider router={router} />
      </MotionConfig>
    </QueryClientProvider>
  );
  await act(async () => {
    await router.load();
  });
  return result;
}
