# apps/web

React 19 + Vite 6, TanStack Router (file routes), Query and Form, Tailwind over the
`shared/ui` tokens. Runs from the product root: `yarn dev:client` (against the server),
`yarn dev:mock` (every `/api` answered by the contract mocks, no server), `yarn build:client`.
`src/app/routeTree.gen.ts` is generated, never committed: the router plugin rewrites it on
every dev and build, and `yarn routes:generate` writes it for `yarn typecheck` and `yarn test`
(run it once after a scaffold or a fresh clone).

## Routes load, screens render

A route under [`src/app/routes/**`](../apps/web/src/app/routes) loads through the contract's
query options (`loader: ensureQueryData(listItemsQuery(http))`), guards in `beforeLoad`,
parses its search and owns the failure; a screen under `features/**/screens/` takes props
and renders — no loading copy, no `failed` branch, nothing reading `window.location`.
Routes have no unit spec; the screen's e2e spec exercises their wiring
([`route-no-logic.grit`](../biome/route-no-logic.grit) keeps state and effects out of them).
A feature hook reaches the server only for what a loader cannot be (a mutation, data that
changes while mounted) and returns only what the view reads
([`hook-narrow-return.grit`](../biome/hook-narrow-return.grit)); a screen never imports
the query library or the transport ([`server-state-boundary.grit`](../biome/server-state-boundary.grit)).

The `example` feature is the reference for all of it: `_app/example.index.tsx` warms the
list and hands `useExampleItems()` to `ExampleList`; `_app/example.$id.tsx` warms one item,
sends a 404 back to the list and rethrows anything else to `RouteError`, and wires
`useExampleActions()` into `ExampleDetail` as props (`key={id}` remounts the screen per
item). `/feature <name>` clones this shape.

A pathless layout — a route whose segment is only an underscore (`_app.tsx`,
`_app/_paid.tsx`) — exists to wrap children, so it always ships at least one. With none,
`yarn routes:generate` collapses it to `/`, where it collides with `routes/index.tsx` and
the run fails with *Conflicting configuration paths*: the message names the two paths that
collided, never the empty layout that caused it.

## The slots

[`src/app/kit.gen.tsx`](../apps/web/src/app/kit.gen.tsx) is generated from the manifest and
never edited: `KIT_PROVIDERS` wrap the router (`App.tsx`), `KIT_GATES` run in order in
`_app.tsx`'s `beforeLoad` and merge what they return into the router context (a gate throws
`redirect` to turn the user away), `KIT_BOOT` runs once before the first render
(`main.tsx`), `KIT_SETTINGS_ACTIONS` are the rows on `/settings`. The types are
[`src/app/kit.types.ts`](../apps/web/src/app/kit.types.ts). A module contributes through
its `module.json`; base ships every list empty, so the example routes are public until a
module says otherwise.

## Where things are

- **The shell**: every screen renders through
  [`Screen.tsx`](../apps/web/src/features/shell/components/Screen.tsx) (canvas, width,
  enter animation, screen tag); the `_app` layout wraps its children in `TabShell` (top
  bar, tab bar over `@domain/shell/tabs`). A screen that must not carry the shell sits
  beside `_app.tsx`, not under it. The three enters are
  [`src/lib/motion.ts`](../apps/web/src/lib/motion.ts).
- **The transport** is [`src/lib/http.ts`](../apps/web/src/lib/http.ts): same-origin fetch,
  every answer parsed by its contract schema, every failure an `HttpError` read through
  `@contracts/http-errors`.
- **The store**, [`src/data/store.ts`](../apps/web/src/data/store.ts), is the only place
  that touches `localStorage` ([`client-storage.grit`](../biome/client-storage.grit)):
  device-side state under one versioned key (`__PRODUCT_SLUG__-state-v1`), spread over
  `EMPTY` on load so an added field defaults on its own. Server data is React Query's, not
  the store's.
- **Copy** comes from `@domain/copy` — a screen never hardcodes a string; `withMarks`
  ([`src/lib/copyMarks.tsx`](../apps/web/src/lib/copyMarks.tsx)) renders the copy layer's
  `*em*` and `**strong**` marks.
- **Mock mode**: `VITE_API_MODE=mock` registers the msw worker
  ([`src/app/mocks.ts`](../apps/web/src/app/mocks.ts)) before the first render; mock state
  is cookies (`@contracts/mock-state`), so a mocked journey survives a reload. The worker
  file in `public/` is msw's own — `npx msw init apps/web/public` regenerates it after an
  msw upgrade.
- **Layout**: the phone is the default. Unprefixed classes are the 375px experience and
  `sm:`/`md:`/`lg:` layer up; the lint bans hex colors, `transition-all` and display-sized
  px text ([`design-system.grit`](../biome/design-system.grit)) and per-element focus
  styles ([`focus-ring.grit`](../biome/focus-ring.grit)).

## Verifying

A screen spec renders through [`renderAt`](../apps/web/src/testing/renderScreen.tsx) —
a memory router built from the generated route tree with a probe on every other route, so
navigation is asserted by `routeTestId("/example")` and never by mocking the router. A hook
spec mocks `~/lib/http` only and asserts the wire bodies
([`mock-seam.grit`](../biome/mock-seam.grit)). Plain functions (`derive.ts`) need no mocks.
Screens identify themselves with `useScreenTag("kebab-name")` and elements with
`data-testid="<screen>-<element>"`; the Playwright suite under `tests/` locates by those
and asserts the tag, never copy.
