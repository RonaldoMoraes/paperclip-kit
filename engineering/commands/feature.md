---
description: Clone the golden-path `example` feature into a new feature across every present layer, then run the gates
argument-hint: "<name> [one line: what it does]"
---

Create the feature **`$1`** (kebab-case) — **$2** — by cloning the `example` feature layer by layer. The structure is the contract; you rename, you do not redesign. These are instructions for you, not a script: read each source file, write its twin, keep the shape.

## 0. Names

From `$1` derive: `Name` (PascalCase, e.g. `TeamNote`), `name` (camelCase), `NAME` (UPPER_SNAKE), `name-kebab` (as given). Replace `Example/example/EXAMPLE/example` accordingly, including in test ids (`example-list-*` → `<name>-list-*`), screen tags, query keys (`["example", …]`), API paths (`/api/example/…`), error classes and copy keys. Item nouns (`Item`, `items`) become the feature's own nouns when the one-line description names them; otherwise keep `Item`.

Read `AGENTS.md` first (the rules that hold on every edit) and `docs/architecture.md` for the shape. Only touch the layers that exist in this tree (`apps/web`, `apps/mobile`, `tests` may be absent).

## 1. Contract (`shared/contracts/<name>/`) — always

Clone `shared/contracts/example/`: the item schema, one module per endpoint (`list-*.ts`, `get-*.ts`, `set-*.ts` with their `*.mock.ts` beside them), `errors.ts` (closed reasons), `mock-library.ts` (seed data), `mock-*-state.ts` (cookie ledger), `index.ts` (handlers). Then add the one line to `shared/contracts/mocks.ts` (`...<name>` beside `...example`). An endpoint exists once: contract + mock + fixture here, nowhere else.

## 2. Server (`apps/server/src/<name>/`) — always

Clone `apps/server/src/example/`: `<name>.module.ts`, `<name>.controller.ts` (`@ZodBody`, the contract's schemas), `<name>.service.ts`, `<name>.store.memory.ts` (structural store), `<name>.types.ts` (the store symbol), specs beside each controller and service. Add `<Name>Module` to the `imports` of `apps/server/src/app.module.ts` (product features go there; `KIT_MODULES` is for kit modules only — never edit `app.modules.gen.ts`). If the tree has a database module and the feature needs persistence, add the Prisma store beside the memory one and say which is wired.

## 3. Web (`apps/web/`) — when present

- `src/features/<name>/`: `screens/<Name>List.tsx`, `screens/<Name>Detail.tsx`, `hooks/use<Name>Items.ts`, `hooks/use<Name>Actions.ts`, `derive.ts`, specs beside every screen (the testing contract requires them).
- Routes: `src/app/routes/_app/<name>.index.tsx`, `_app/<name>.$id.tsx` — a route mounts the screen and loads; it holds no logic. Then `yarn routes:generate` (never edit `routeTree.gen.ts`).
- Copy: `shared/domain/<name>/copy.ts` + the barrel line in `shared/domain/copy.ts`.
- Shell: add the tab to `shared/domain/shell/tabs.ts` only if the founder wants it in the navigation; say so either way.
- E2E (`tests/`): `specs/web/contract/<name>/<name>-list.spec.ts` and `<name>-detail.spec.ts` (one keyboard-only variant; one `page.reload()` assertion on persisted state), the element catalog `elements/<name>.yaml` (test ids only — no text/placeholder/label locators), and the page object under `pages/`. Then `yarn test:e2e:validate`.

## 4. Mobile (`apps/mobile/`) — when present

- `src/features/<name>/` mirrors web (screens, hooks, specs).
- Routes: `app/(app)/(tabs)/<name>.tsx`, `app/(app)/<name>/[id].tsx` — mount only.
- Same copy and tabs decisions as web (shared on purpose: `shared/domain`); anything one-platform on purpose gets a comment saying so.

## 5. Analytics (when the `analytics` module is present)

Propose the events for the new screens — success / funnel / choice / friction — as enums and slugs (never free text), add them to the events union, and fire them from the feature hooks. If the founder has not decided, list the proposal and leave a `TODO(analytics)` that the reminder hook will keep surfacing.

## 6. Gates

Run, in order, and report each honestly with output on failure: `yarn typecheck` · `yarn lint` · `yarn lint:guards` · `yarn test` · `yarn test:contract` · `yarn test:e2e:validate` · `yarn test:e2e` (scoped to the new specs first, then the suite). The feature is done when every gate is green in every present layer. No git writes unless the founder asks.
