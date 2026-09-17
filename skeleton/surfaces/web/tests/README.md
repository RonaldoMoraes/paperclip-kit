# @__SCOPE__/e2e

The web end-to-end suite for __PRODUCT_NAME__ (Playwright). A yarn workspace of the product,
run from the product root.

## How to run — follow this order

```bash
# 1. once per machine
yarn --cwd tests playwright:install

# 2. the gates, before or with every meaningful change
yarn test:e2e:validate        # elements catalog + no raw locators in specs
yarn test:contract            # every routed screen has a contract journey spec

# 3. the lanes
yarn test:web:contract        # the loop while adding or changing a routed screen
yarn test:web:smoke
yarn test:web:regression
yarn test:e2e                 # every web project at once
```

Playwright starts the Vite client (`webServer`) if nothing is already listening on `BASE_URL`
(default `http://localhost:5173`; the port in it is the one it starts on) — without the app's
own mock worker: the fixture answers `/api` at the browser's edge, and an in-page worker
would answer first and bypass it.
Append `-- --ui` to any `test:web:*` command for the interactive runner. The HTML report is
`playwright-report/` (`yarn --cwd tests playwright show-report`).

## Lanes

| Lane | Folder | Purpose |
| --- | --- | --- |
| Contract | `specs/web/contract/<journey>/` | Per routed screen (required by `test:contract`); the screen stands ready |
| Smoke | `specs/web/smoke` | Short, real usage — title, CTA, empty, list |
| Regression | `specs/web/regression` | Broad / multi-step / action → response |

See [docs/smoke-vs-regression.md](./docs/smoke-vs-regression.md).

## Patterns

- **One YAML per screen** under `elements/` + `shared.yaml` for cross-screen locators — keys
  are semantic; `locator` + `value` per **`web` / `mobile`** front, `none` where a platform has
  no counterpart. Only the static spine lives there; per-row testids are built by the page
  object from the same prefix.
- **POMs** in `pages/web/`, AAA methods, `tabTo(key)` / `pressEnter()` for the keyboard journey.
- Specs stay AAA and locator-free (`validate:specs`), and **mode-agnostic**: `E2E_API_MODE=mock`
  (default / CI) answers every `/api` call from the contract handlers (`shared/contracts/mocks.ts`)
  via `fixtures/web.ts` — the same list the app runs in mock mode, so a new endpoint is mocked
  for the suite the moment its `.mock.ts` exists. `=live` skips the routing and talks to a real
  server. `api.mock()` overrides one endpoint for one test (a forced error, a `delayMs` for a
  state that is about the wait) — a no-op in live, so skip those cases when `apiMode === "live"`.
- An unanswered `/api` call, a throwing resolver or an uncaught page error fails the test.
- Store seeds go through `helpers/store.ts` (`seedStore`), and the app's own `testing/seeds.ts`
  (type-only imports) is what a spec imports for the canonical ones.

## Gates

`yarn test:e2e:validate` → elements catalog + no raw locators in specs.
Details: [docs/quality-gates.md](./docs/quality-gates.md).
