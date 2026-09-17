# Verifying web UI changes in the browser

The dev server's hot reload is unreliable for layout, CSS, and stacking/portal work: an
edit can fail to apply, or land several edits late. **Never judge a visual fix from what
the page happens to look like.**

[Reason: HMR lag makes the last edit look like the fix, so agents stack unrelated changes
and report the wrong root cause. A 200 was once reported as "serving correctly" while
every page was blank.]

## Before you look

1. Hard-reload the route (`browser_navigate` to the URL again, or `browser_reload`).
2. Confirm the DOM actually carries your change — inspect the element's class list or
   computed style with `browser_evaluate` — before deciding whether it worked.

## While iterating

- **Change one thing at a time.** When the screen finally looks right after several
  attempts, the most recent edit is the *least* likely cause.
- Revert the other edits and reload to prove which one is load-bearing.
- Delete the edits that turn out to be inert. Do not leave them in "because it works now".

## For stacking and overlay bugs

Assert the fix instead of eyeballing it. At the control that was unreachable:

```js
document.elementFromPoint(x, y)
```

That tells you what is actually on top.

## Before reporting the app as working

**A 2xx is not a healthy app.** `curl` gets the static SPA shell whatever state the client
bundle is in, so it answers 200 for a page that renders nothing.

After a restart, a rebuild, or a config change, load a route in a browser and confirm it
rendered: a non-empty `browser_snapshot` that carries the screen's tag
(`useScreenTag("<kebab-name>")` → a `data-screen` you can assert on), or a
`browser_console_messages` read with no module-init errors.

A white page with a 200 usually means one of:

- a `dist` built without the `VITE_*` values the bundle inlines — rebuild, or run the dev
  server instead of the built output;
- mock mode on but a handler missing — the fixture fails closed; read the console for the
  unanswered `/api` path and add the handler beside the contract;
- the route tree is stale — `yarn routes:generate` (never edit `routeTree.gen.ts`).

## Mock mode is the default for verification

`yarn dev:mock` starts the web app with `VITE_API_MODE=mock`: every `/api` call is
answered by `shared/contracts/mocks.ts`, no server needed. Seed the state a screen needs
through the contract's mock (its fixture, or the cookie ledger the mock keeps), never by
hand-editing responses in the browser. When the claim is about the server half, switch
to real mode (`yarn dev`) and say so in the evidence.
