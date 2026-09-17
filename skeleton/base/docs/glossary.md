# __PRODUCT_NAME__ — glossary

The product vocabulary as the design source of truth and the product docs use it. Each
term links to the module that names it; a term with no link exists only in the design so
far — a definition you can't follow to an implementation goes stale without anyone
noticing. The engineering terms are in [`AGENTS.md`](../AGENTS.md).

Every number the product shows is computed once, in [`shared/domain`](../shared/domain),
and read the same way by web, mobile and server.

## Same thing, different names

The left column is the term to **use when writing** — in code, commits, PR titles, and
tickets. The aliases are what people say; recognize them, don't propagate them.

| Use this | Also called | What it actually is |
| --- | --- | --- |
| **Item** | entry, todo | The `example` feature's unit of work — [`shared/contracts/example/item.ts`](../shared/contracts/example/item.ts). Replace this row with the product's first real noun. |

## Product terms

<!-- One section per area: term — one sentence — the module that holds it. -->

- **Item** — a titled note the user marks done. `Item` in
  [`shared/contracts/example/item.ts`](../shared/contracts/example/item.ts); listed and
  toggled through `list-items.ts`, `get-item.ts`, `set-item-done.ts` beside it.

## Engineering terms

- **Contract** — one endpoint's module in `shared/contracts/<feature>/`: the Zod schemas,
  the path, the query/mutation helper. Its **mock** is the `.mock.ts` beside it; its
  **fixture** is that mock's default response. Nothing else describes the API.
- **Mock mode** — every `/api` call answered by the contract mocks, no server running
  (`yarn dev:mock`, `yarn mobile:mock`, and every e2e run). **Real mode** — against
  `apps/server`.
- **Feature** — the same folder name in every layer: `shared/contracts/<feature>/`,
  `apps/server/src/<feature>/`, `apps/{web,mobile}/src/features/<feature>/`.
- **Screen** — a `.tsx` under `screens/`: props in, testIDs out. **Route** — what
  mounts it and loads what it needs. A route holds no state of its own.
- **Screen spec** — the Playwright contract file for one web screen,
  `tests/specs/web/contract/<journey>/<kebab-name>.spec.ts`, one test per screen state.
- **The testing contract** — what `scripts/check-test-contract.mjs` enforces: a unit spec
  beside every screen and every controller/service, a screen spec for every routed web
  screen, no copy-coupled locator in the e2e suite.
- **Port** — an interface the server calls (`notification`, `analytics`, `telemetry`)
  under `apps/server/src/common/ports/`, with a console or no-op default. A module
  provides the real implementation; the domain never imports a vendor SDK.
- **Guard** — a rule enforced by a machine: a Biome GritQL plugin (`biome/*.grit`), a
  check script (`scripts/check-*.mjs`), or a write-time hook (`.claude/hooks/`). Every
  guard has a canary that proves it fires — see [`checks.md`](checks.md).
- **Canary** — a deliberately violating fixture under `scripts/lint-canary/` that
  `yarn lint:guards` lints under the real config; a guard that stays silent on it is dead.
- **Write-time guard** — a hook under `.claude/hooks/` that runs after every edit and
  refuses (exit 2) what a machine can decide on the spot: an edit to a generated file, a
  testing-contract violation.
- **Worktree** — one checkout per change under `yarn wt`, with its own port slot
  (`base + 10 × slot`) — see [`worktrees.md`](worktrees.md).
- **Trunk** — `__TRUNK__`; every branch is cut from it and returns to it by PR — see
  [`branching.md`](branching.md).
