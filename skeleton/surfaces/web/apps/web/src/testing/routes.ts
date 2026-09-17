import routeTreeSource from "../app/routeTree.gen.ts?raw";

/**
 * The app's routes, read out of the generated route tree.
 *
 * Read as text rather than imported: `routeTree.gen.ts` pulls in every route module, and
 * with them the loaders, gates and transport a screen spec exists to leave out. The router
 * plugin rewrites that file whenever a route file is added or renamed, so a new route
 * reaches `renderAt` with nothing to edit here.
 */

/**
 * The paths a user can be at, in the generator's own words: the keys of `FileRoutesByTo`,
 * which is the map of what `navigate({ to })` accepts — pathless layout routes excluded,
 * nested paths already joined.
 */
export function readRoutePaths(source: string): string[] {
  const block = source.match(/export interface FileRoutesByTo \{([\s\S]*?)\n\}/);
  const paths = block ? [...block[1].matchAll(/^\s*["']([^"']+)["']:/gm)].map((match) => match[1]) : [];
  if (paths.length === 0) {
    throw new Error("routes: no paths found in routeTree.gen.ts — the generated shape changed");
  }
  return paths;
}

export const KNOWN_ROUTES = readRoutePaths(routeTreeSource);
