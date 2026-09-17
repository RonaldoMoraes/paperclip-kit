# __PRODUCT_NAME__

<!-- One paragraph, kept current: what the product is, who uses it, what they do with it. -->

A NestJS server (`apps/server`), a React/Vite web app (`apps/web`) and an Expo app
(`apps/mobile`) — the surfaces this product ships with — over `shared/contracts` (the API as
every app sees it), `shared/domain` (rules and copy, computed once) and `shared/ui` (the design
system). One product, one repo, built standalone. The rules that hold on every edit are in
[`AGENTS.md`](AGENTS.md); how each part works is in [`docs/`](docs/README.md); this page is how
to run it.

## Run

```bash
corepack enable && yarn install   # Node 22.17.1 (volta reads the pin; nvm: `nvm use 22.17.1`), Yarn 4
cp .env.example .env              # every variable names the file that reads it
yarn routes:generate              # web: apps/web/src/app/routeTree.gen.ts is generated, never committed
yarn dev                          # server on :3000 + web on :5173 (`dev:server` / `dev:client` separately)
yarn dev:mock                     # web alone, every /api answered by the contract mocks — no server
yarn mobile                       # Expo on :8300 (`yarn mobile:mock`: the same, over the mocks)
```

Build the screen against the mock first (`yarn dev:mock`, `yarn mobile:mock`); the server
implements the contract afterwards. The `example` feature is the reference for every layer —
contract, server, web, mobile, e2e — and `/feature <name>` clones it.

## Gates

Every gate is a root script; what CI runs is what you run. Done means all green.

| gate | proves |
| --- | --- |
| `yarn typecheck` | the tree compiles — server, web, mobile, tests, db, whichever exist |
| `yarn lint` | Biome: format, imports, rules, and every `biome/*.grit` guard |
| `yarn lint:guards` | every guard is wired **and fires** on its canary |
| `yarn test` | unit specs (`vitest run`, plus the mobile project when present) |
| `yarn test:contract` | the testing contract: every screen, controller and service has its spec |
| `yarn test:e2e:validate` | the Playwright catalogs and specs are well formed, no copy-coupled locator |
| `yarn test:e2e` | every web screen state, hermetic — Chromium once: `yarn --cwd tests playwright:install` |

[`docs/checks.md`](docs/checks.md) has what a diagnostic cannot say. Modules add their own
steps (`yarn db:generate` before typecheck with the database module; `yarn copy:diff` with
copy-diff) — see each module's page in `docs/`.

## Worktrees

Every change is a worktree cut from `__TRUNK__`; the primary checkout is never worked in.

```bash
yarn wt create feat/KEY-123-short-name   # cut the branch, provision the worktree
yarn wt run [--db]                       # bring this worktree's stack up on its own port slot (base + 10 × slot)
yarn wt publish                          # push the branch and open the PR
yarn wt dispose                          # remove the directory, keep the branch
```

`--db` gives the worktree its own database — required for any schema change.
[`docs/worktrees.md`](docs/worktrees.md) has the full CLI, [`docs/branching.md`](docs/branching.md)
the branch and release flow.

## Where things live

| what | where |
| --- | --- |
| the rules that hold on every edit | [`AGENTS.md`](AGENTS.md) (`CLAUDE.md` is a symlink to it) |
| how each part works, present tense | [`docs/`](docs/README.md) — architecture, glossary, checks, one page per app and per module |
| plans not yet built | `.spec/<domain>/` — deleted when they ship |
| procedures agents run on demand | `.agents/skills/`; commands in `.agents/commands/` (`.claude/` symlinks there) |
| the API, one endpoint per module with its mock beside it | `shared/contracts/` |
| the words | `shared/domain/<feature>/copy.ts`, read through `@domain/copy` |
| env keys | `.env.example` — every key names the file that reads it; `.env` holds the real values |
| the kit manifest and ledger | `.paperclip/project.manifest.json`, `.paperclip/scaffold.lock.json` (`/scaffold --update`, `/module <id>`) |
