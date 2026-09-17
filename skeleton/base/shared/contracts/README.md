# shared/contracts

The API as every app sees it — one module per endpoint holding its zod schemas, the call
itself, and its mock. Enums both sides must agree on and cross-app constants live here too.

Rules:

- Plain data, types, zod and functions over `Http` only. No React, no NestJS, no `fetch` —
  a contract module is imported by the web app, the Expo app and the server alike, so it
  never names a platform. Transport is the app's `Http` (`http.ts`), passed in:
  `setItemDone(http, id, done)`.
- A contract changes in the same commit as both sides that speak it.
- An endpoint exists once: here, with its mock beside it. The server controller parses
  with the schema declared here; the screens call the function declared here; the e2e
  suite seeds from the fixture declared here.

Imported as `@contracts/*` from the web app, the Expo app and the server alike.

`example/set-item-done.ts` is the canonical module: one endpoint, its Request and
Response schemas, the call and its query options, in that order.

## The skeleton of an endpoint module

```ts
/** `PUT /api/example/items/:id/done` — what this endpoint is for, and why it exists. */
export const SetItemDoneRequest = z.object({ done: z.boolean() });
export type SetItemDoneRequest = z.infer<typeof SetItemDoneRequest>;

export const SetItemDoneResponse = Item;
export type SetItemDoneResponse = z.infer<typeof SetItemDoneResponse>;

export function setItemDone(http: Http, id: string, done: boolean): Promise<SetItemDoneResponse> {
  return http.put(`/api/example/items/${encodeURIComponent(id)}/done`, SetItemDoneResponse, { done });
}

export function getItemQuery(http: Http, id: string) {
  return {
    queryKey: ["example", "items", id] as const,
    // Why this staleTime: the reason, stated, so nobody guesses later.
    staleTime: 0,
    queryFn: () => getItem(http, id),
  };
}
```

Sections in that order: the doc comment, the Request schema and its type, the Response
schema and its type, the call, its query options, and last the paths and constants both
sides share when the endpoint has any. `const` for schemas and data, `export function`
for the call and its query options. A timestamp on the wire is an ISO-8601 string
(`z.iso.datetime()`); a reader that computes with it declares `z.coerce.date()` at its own
seam. Cookies are `MockCookies` (`mock-state.ts`) wherever a function reads them.

## Layout

`http.ts` — the `Http` interface each app implements once (`src/lib/http.ts`) and the
`HttpError` those implementations throw.

`errors.ts` — the envelope every failed `/api` call answers with and the closed
`API_ERROR_CODES` the base server sends. A module with conditions of its own widens the
union in its own `<module>/errors.ts`.

`http-errors.ts` — what a caught `HttpError` was, and the line a person reads for it:
`failureReason` for the closed reason analytics reports, `failureCopy` for the sentence.
One classification for every platform, so no screen writes its own at the catch site.

`<feature>/<endpoint>.ts` — one endpoint, in the skeleton above. Query keys are
`[feature, ...]` so a feature's cache can be invalidated as one.

`<feature>/<endpoint>.mock.ts` — beside it: `fixture`, the default response built with
`schema.parse(...)` so a mock that has drifted throws at import, and `handlers`, the MSW
handler list for that endpoint. Paths are written `*/api/…` so one handler serves the web
app's same-origin fetch and the Expo app's absolute one. A refusal is built with
`apiError`, `unauthorized` or `notFound` from `mock-response.ts`, never a literal envelope.

`<feature>/errors.ts` — the feature's refusals classified once: a `<Feature>FlowError`
carrying the copy and the closed reason, and `<feature>Failure(error)` to build it from a
caught failure. `example/errors.ts` is the reference.

`<feature>/index.ts` — that feature's `handlers`, one line per endpoint. A new endpoint in
an existing feature is edited here and nowhere else.

`mocks.ts` — every feature's handlers in one list, one line each, plus `KIT_HANDLERS`
from `mocks.gen.ts` — the opted-in modules' handlers, written by the scaffold and never
by hand. The web app starts the list with `setupWorker` (`VITE_API_MODE=mock`), the Expo
app with `setupServer` from `msw/native` (`EXPO_PUBLIC_API_MODE=mock`), and
`tests/fixtures/web.ts` runs the same list as the Playwright suite's hermetic defaults.
Nothing here names a platform.

`mock-state.ts` — mock state as cookies: `mockStateCookie(key, value)`,
`clearedMockStateCookie(key)` and `readMockState(cookies, key, schema)`, which answers
`null` for anything the schema refuses rather than throwing. Every ledger is named through
`mockCookieName(name)`, under the product's cookie prefix. `MockCookies` — the record msw
hands a resolver — is declared here and is the one cookie type in this directory.
`example/mock-item-state.ts` is the reference use of it.

`mock-response.ts` — the msw side of the pair: `json(body, init)`, the response builder
every `.mock.ts` answers with, and the refusals in the server's own envelope. Every msw
response in `shared/contracts` is built from here. A `.mock.ts` still pulls in msw, and
the Playwright suite runs the handlers itself, so msw is in that suite's graph by design.

## Mock state

A mock that has something to remember answers with a `Set-Cookie`, and every mock that
needs to know reads it back off the request's `cookies`:

```ts
http.put("*/api/example/items/:id/done", async ({ cookies, params, request }) => {
  const next = { ...readMockItemState(cookies), [id]: { done, updatedAt } };
  return json(SetItemDoneResponse.parse(item), { headers: { "set-cookie": itemStateCookie(next) } });
});
```

That is what makes a mocked journey survive a reload and a relaunch, and it is why a
mocked run exercises the same client code paths as a real one: on web msw keeps its own
cookie jar (in `localStorage["__msw-cookie-store__"]` — not the browser's, so DevTools'
Application ▸ Cookies stays empty in mock mode), on mobile the app sends the cookie as
the `Cookie` header. The readers in `mock-state.ts` say why a value can arrive doubled
on native and why that is harmless.

The resolver reads msw's parsed `cookies`, not `request.headers.get("cookie")`: `Cookie`
is a forbidden header name, so in a browser it can never be read off a `Request` and a
resolver there would always see nobody. msw merges the request header, the document and
its own jar into `cookies` before the resolver runs, which is the one source that carries
state on every platform.

A session, when the auth module is on, is one more cookie read the same way — that
module's `mock-session.ts` documents its cookie, its magic values and how a mocked run
boots signed in. Base has no session: every endpoint here is public.
