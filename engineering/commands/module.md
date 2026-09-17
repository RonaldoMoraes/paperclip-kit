---
description: Add a kit module to an existing project (manifest → scaffold --update → post-scaffold notes → gates)
argument-hint: "<module-id> | list"
---

Add the kit module **`$1`** to this project (or, for `list`, show what is available).

1. Read `.paperclip/kit.json` → `kitPath`. List `$kitPath/skeleton/modules/*/module.json` (`id`, `title`, `summary`, `requires`, `surfaces`, `placeholders`, `postScaffold`). For `list`, print that table marked with what `.paperclip/project.manifest.json` already includes, and stop.
2. Check the request: the id must exist; every id in its `requires` must be in `manifest.modules` or be a surface in `manifest.surfaces`. A missing module: say which and propose adding it in the same run. A missing surface (`payments-revenuecat` requires `mobile`, which itself requires `web`): stop and explain — surfaces are a `/grill` decision, not a side effect.
3. For each `placeholders` entry the module declares, ask its `question` (offer the `default`) and store the value under `manifest.placeholders`.
4. Edit `.paperclip/project.manifest.json`: append the id (and any required ids) to `modules`; record the reason in `answers` under the matching area key. Show the diff.
5. Run the engine in update mode:
   ```bash
   bash "$kitPath/bin/scaffold.sh" --manifest .paperclip/project.manifest.json --out . --update
   ```
   Relay the summary; the "skipped (edited by the product)" list is for the founder to decide on. Gen files are regenerated; merged files get the module's fragments appended onto the current file — product edits survive.
6. Run the printed checklist: `yarn install`, `yarn routes:generate` (web), `yarn db:generate` (when `db-prisma` is now in the tree), the module's `postScaffold` notes, then the gates one at a time — `yarn typecheck` · `yarn lint` · `yarn lint:guards` · `yarn test` · `yarn test:contract` · `yarn test:e2e:validate` · `yarn test:e2e` — reporting each honestly. Read the module's page in `docs/<id>.md` and the new block in `AGENTS.md` before fixing anything: the module documents how to wire it (e.g. which gate guards a route, which env values are needed).
7. Report: what landed (files, env keys to fill from `.env.example`, new scripts), the gates' state, and the next step. Nothing is "done" while a gate is red.
