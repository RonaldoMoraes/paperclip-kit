# Upgrading an existing install

`install.sh` never overwrites anything. A re-run adds the files that are new in this version, skips every file that exists, refreshes `.paperclip/kit.json`, and registers new paths in `.git/info/exclude`.

## 0.3 → 1.0: a rewrite of the company layer

1.0 replaces the build harness (`HARNESS.md`, work orders, the critic loop, per-slice checkpoints), the `pc` ledger and the eight spawned personas with:
- **role lenses**, not spawned agents;
- a **control panel** (`STATUS.md`, drawn by `.paperclip/bin/panel`);
- **Superpowers** as the engineering engine;
- **ai-memory** as the memory.

The benchmark behind the change is in `bench/RESULTS.md`.

**The simple way:** run `~/paperclip-kit/setup.sh` inside the project. It detects the old install, does everything below, carries your own `CLAUDE.local.md` sections, `PLAYBOOK.md` rules and hired roles over for review, and sets up ai-memory, Codex and Superpowers. Review the "Carried over" and "House rules" sections it adds.

**By hand:** because a re-run never replaces files, an upgrade has to move the old ones aside:

```bash
~/paperclip-kit/install.sh /path/to/repo --replace-company --with-superpowers
```

`--replace-company` moves the old machinery into `.paperclip/.backup-<time>/`: `CLAUDE.local.md`, `PLAYBOOK`, `HARNESS`, `bin/pc`, the ledger folders, `briefs/` and `orders/`, and the old personas and commands. Nothing is deleted. What stays in place:
- **The company's memory:** `STATUS.md`, `decisions.md`, `STORY.md`. 1.0 reads their older formats: other table columns, `### 001 — title` decisions, emoji headings.
- **Anything else you keep in `.paperclip/`.**
- **The scaffold's own files** (`project.manifest.json`, `scaffold.lock.json`).
- **The engineering layer.** Add `--company-only` when the repo has its own `.agents/` and you don't want the kit's.

Then carry your own edits over by hand:
- **Your `CLAUDE.local.md` sections** (product context, house rules): copy them from the backup into the new file, under its toggle.
- **`PLAYBOOK.md` rules that are still true** (staffing, guardrails): add them to `.paperclip/COMPANY.md` as a house-rules section. Drop the ones about the harness and the ledger.
- **Hired roles**: turn each old `.claude/agents/<role>.md` into a lens card, `.paperclip/roles/<role>.md` (see `/hire`). Keep the agent file too if the role should still run in parallel.
- **History**: if ai-memory is installed, `ai-memory bootstrap` imports existing sessions.

Reload the Claude Code session afterwards: new commands and agents are picked up on the next start.
