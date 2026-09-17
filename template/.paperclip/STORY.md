# <Project> — The Story (deep context)

> **What this is:** the narrative backbone of the company/repo — history, strategy, the codebase, and the Founder's standing concerns. It is **NOT** always in context (that's `STATUS.md`'s job, kept lean). It loads **on demand** when a discussion needs real depth — via `/brief` or the PLAYBOOK trigger rule.
> **To populate:** tell Claude "write our story" — it'll draft each section from the repo + `decisions.md` + `STATUS.md`, and interview you for the rest. Keep §6 (your concerns) in your own words.
> **Last updated:** <date>

## 1. The premise
What we're building, for whom, and the core thesis/bet. Why it should exist.

## 2. The arc so far
How we got here — the key chapters, pivots, and the *why* behind each turn (the reasoning, not just the what).

## 3. Where we *really* are
The honest current state — beyond the Control Panel's status lines. The real stage; what's solid vs. fragile.

## 4. Codebase tour
What's actually built in code — enough for a cold session to orient without spelunking. One bullet per area, each ending with the trap to know. The generated layout is below; delete the areas this product does not have and add what is ours rather than the kit's (load-bearing vs. scaffolding, the files a feature touches, our own conventions).

- **`apps/server`** — NestJS 11. `app.module.ts` holds product features; `app.modules.gen.ts` (`KIT_MODULES`, `KIT_PORTS`, `KIT_RAW_BODY_PATHS`) is generated and never edited. The three ports in `common/ports/` (notification, analytics, telemetry) have console defaults a module replaces through the scaffold. Trap: the `apps/server/**` override in `biome.json` must stay last, or server specs with parameter decorators stop parsing.
- **`apps/web`** — React 19 + Vite 6; file routes under `src/app/routes/` load, screens under `src/features/*/screens/` render, hooks return only what the view reads; `src/app/kit.gen.tsx` is generated. Trap: `src/app/routeTree.gen.ts` is gitignored — `yarn routes:generate` after a scaffold or a fresh clone, or typecheck and vitest fail on a missing file.
- **`apps/mobile`** — Expo 54 + expo-router 6 + NativeWind 4 over the same contracts, domain and copy; `src/kit.gen.tsx` is generated. Trap: it requires the web surface (its Appium lane lives in `tests/`); `yarn typecheck:mobile` once writes `expo-env.d.ts` and `.expo/types`, both gitignored.
- **`shared/contracts`** — one endpoint = one module + its `.mock.ts` beside it; `mocks.ts` is base's handlers + `KIT_HANDLERS`; mock state is cookies, so a mocked journey survives a reload. Trap: import the endpoint module (`@contracts/example/list-items`), never a feature's `index.ts` — the barrel holds msw handlers and would drag msw into the app.
- **`shared/domain`** — rules and copy computed once: `copy.ts` is the barrel (`@domain/copy`), one `<feature>/copy.ts` per feature, `shell/tabs.ts` the navigation, `flow/` the pure multi-step engine. Trap: a screen never hardcodes a string; a tab added to `tabs.ts` is a type error until `SHELL_COPY.tabs` names it; a module's copy is imported from its own module, not the barrel.
- **`shared/ui`** — tokens, `Button(.native).tsx`, `cn`, motion tokens; `.native.tsx` resolves first on mobile. Trap: it never imports from an app (`ui-app-boundary.grit`), and hex colors / `transition-all` / per-element focus styles are lint errors.
- **`tests/`** — the hermetic Playwright workspace: `specs/web/{contract,smoke,regression}`, `elements/*.yaml`, `pages/`, `fixtures/web.ts` answering every `/api` from the contract mocks; mobile's Appium lane beside it. Trap: locate by testid only — `yarn test:e2e:validate` rejects copy-coupled locators; Chromium once via `yarn --cwd tests playwright:install`.
- **`db/`** (db-prisma) — the `@<scope>/db` workspace: multi-file Prisma schema, migrations, seed, generated client. Trap: only `apps/server/src/database/prisma.ts` imports it (`db-seam.grit`); a schema change runs in a worktree with its own database (`yarn wt run --db`); `yarn db:generate` before typecheck.
- **`scripts/`** — `check-lint-guards.mjs` (every grit is wired and fires on its canary), `check-test-contract.mjs` (every screen, controller and service has its spec; also runs at write time), `wt/` (the worktree CLI; product names live in `wt.config.sh`). Trap: a dead guard fails open with zero diagnostics — `yarn lint:guards` is the gate that catches it.
- **`docs/`** — present tense only: `README.md` is the map, one page per app and per module, `checks.md` for what a diagnostic cannot say. Trap: a *should* / *will* / *TBD* belongs in `.spec/<domain>/`, deleted when it ships.
- **`.agents/`** — agents, commands, skills; `.claude/` symlinks into it and holds `settings.json` (write-time guard, worktree hooks). Trap: edit only under `.agents/`; the hooks are kit-managed and refreshed by `/scaffold --update`.
- **`.paperclip/`** — `project.manifest.json` and `scaffold.lock.json` are the product's and tracked; the rest is local. Trap: an edit to a `*.gen.*` file is reported and skipped by `/scaffold --update`, never merged.

## 5. Strategic threads
The decisions that shaped us and how they connect (the formal log lives in `decisions.md`). The throughlines.

## 6. 🔴 The Founder's standing concerns
The Founder's deep, persistent worries and open questions — what keeps them up at night, the risks they want watched. **In the Founder's own words.** Revisit these in every major decision.

## 7. What's deliberately NOT done — and why
The conscious omissions and deferrals, so nobody "fixes" something that was left undone on purpose.
