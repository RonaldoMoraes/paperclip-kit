# Upgrading an existing install

`install.sh` never overwrites anything. A re-run adds the files that are new in this version, skips every file that exists, refreshes `.paperclip/kit.json`, and registers new paths in `.git/info/exclude`.

## 0.3 → 1.0: a rewrite of the company layer

1.0 replaces the build harness (`HARNESS.md`, work orders, the critic loop, per-slice checkpoints), the `pc` ledger and the eight spawned personas with:
- **role lenses**, not spawned agents;
- a **control panel** (`STATUS.md`, drawn by `.paperclip/bin/panel`);
- **Superpowers** as the engineering engine;
- **ai-memory** as the memory.

The benchmark behind the change is in `bench/RESULTS.md`.

Because a re-run never replaces files, an upgrade has to move the old ones aside:

```bash
~/paperclip-kit/install.sh /path/to/repo --replace-company --with-superpowers
```

`--replace-company` moves every 0.3 company-layer path into `.paperclip/.backup-<time>/`. It covers `CLAUDE.local.md`, `PLAYBOOK`, `HARNESS`, `STORY`, `STATUS`, `decisions`, `bin/pc`, the ledger folders, `briefs/` and `orders/`, and the old personas and commands. Nothing is deleted. The scaffold's own files (`project.manifest.json`, `scaffold.lock.json`) and the engineering layer are left in place.

Then carry your history over by hand:
- **`STATUS.md`**: copy the rows from the backup into the new sections. §1 (waiting on the Founder) and §5 (next) map directly. In-flight work becomes §2 rows, with a plan path once Superpowers writes one.
- **`decisions.md`**: append the old entries under the new heading format (`## NNN · date · title`) so the panel lists them.
- **`STORY.md` and `research/`**: if ai-memory is installed, `ai-memory bootstrap` imports existing history. Otherwise keep them in the backup and point to them from `STATUS.md`.
- **Hired roles**: turn each old `.claude/agents/<role>.md` into a lens card, `.paperclip/roles/<role>.md` (see `/hire`).

Reload the Claude Code session afterwards: new commands and agents are picked up on the next start.
