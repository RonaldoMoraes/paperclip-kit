---
description: Generate (or re-apply) the product tree from .paperclip/project.manifest.json, then install and run every gate
argument-hint: "[--dry-run] [--force-gen]"
---

Scaffold this directory from its manifest. Extra flags: **$ARGUMENTS**.

## 1. Preconditions

- `.paperclip/kit.json` must exist → read `kitPath`. If it is missing, the kit was not installed here: say so and stop (`~/paperclip-kit/install.sh .`).
- `.paperclip/project.manifest.json` must exist. If it is missing, offer `/grill` and stop.
- If `.paperclip/scaffold.lock.json` exists, this tree was scaffolded before: run in **update** mode (the engine refuses a plain run on a locked tree).
- Node: the product pins **22.17.1** (`volta` picks it up from the generated `package.json`; with nvm, `nvm use 22.17.1`). The engine runs on 20 with a warning; `yarn install` and the gates do not. Check `node --version` in this directory before step 3 and say what you found.

## 2. Run the engine

```bash
bash "$kitPath/bin/scaffold.sh" --manifest .paperclip/project.manifest.json --out . [--update] [--dry-run] [--force-gen]
```

The flags, as `--help` prints them: `--manifest <path>` (required) · `--out <dir>` (default: cwd) · `--kit <dir>` (default: the kit the script lives in — never needed here, `kit.json` already points at it) · `--update` · `--dry-run` · `--force-gen`.

- Pass `--update` when the lock exists. Pass through any flag the founder gave.
- Read the summary it prints (added / updated / regenerated / merged / unchanged / skipped) and the **left alone (product edits)** list — relay that list verbatim: those are files the kit wanted to refresh but left alone; the founder decides whether to hand-merge.
- A gen file listed as "edited; --force-gen rewrites it" means someone edited a generated file. Do not re-run with `--force-gen` on your own; ask.
- On an engine error (`✗ …`): it is a manifest or kit problem, not a code problem. A surface or module `requires` that is not satisfied (mobile needs web; auth needs db-prisma), a module id that does not exist, a placeholder without a value → fix the manifest, or re-run `/grill <area>`. Anything else → report the kit problem with the exact message. Do not patch the kit from inside a product.
- `--dry-run` prints the plan (one line per file: action, path, source layer) and writes nothing: show it and stop.

## 3. Finish what a script cannot (the checklist the engine printed)

Run each step yourself, in order, and report each result honestly with the failing output when it fails. Package-scoped commands only; never a whole-machine install.

1. `HUSKY=0 yarn install` on the first run (no `.git` yet, so nothing for the hooks to install; a plain `yarn install` from then on).
2. `yarn routes:generate` — web surface only: `apps/web/src/app/routeTree.gen.ts` is generated and gitignored; typecheck and vitest need it.
3. `yarn db:generate` — when `db-prisma` is in the tree: the client is gitignored; typecheck and the server specs read it; it needs no database.
4. Every `[module] …` post-scaffold note the engine printed. A note that needs a terminal or a running database (`docker compose … up -d`, `yarn db:migrate --name init`) runs with the founder present; a note that costs money or leaves the machine is never run — it is reported.
5. The gates, one at a time, each green in the generated tree before the next:
   `yarn typecheck` · `yarn lint` · `yarn lint:guards` · `yarn test` · `yarn test:contract` · `yarn test:e2e:validate` · `yarn test:e2e`
   (`test:e2e` needs no server: mock mode, every `/api` answered from the contract mocks, hermetic. Chromium once per machine: `yarn --cwd tests playwright:install`. Both `test:e2e:*` exist only with the web surface.)

When a gate fails:
- Read the error, fix it in product-owned files, re-run that gate. Never edit a `*.gen.*` file (the header says why); a gen-file problem is a `module.json` problem in the kit — report it.
- A failure in kit-shipped code (a base, surface or module file you did not touch) is a kit bug: report the file, the command and the output; fix it locally only if the founder asks, and say the fix should go upstream.
- `lint:guards` failing means a guard's canary did not fire — the guard is dead, which is worse than no guard. Report it; do not delete the canary.

## 4. Report

- Green: "The project is ready: <n> files, surfaces <…>, modules <…>; every gate green." Then point at `README.md` (how to run it), `AGENTS.md` (the rules that hold on every edit) and `docs/README.md`, and suggest `/feature <name>` for the first real feature.
- Not green: the list of gates with pass/fail and, for each failure, the one-line cause and what you propose. Nothing is "ready" while a gate is red.
- If `.paperclip/STATUS.md` exists (Paperclip is on), record the scaffold under §3 Live systems and the next action under §5.
