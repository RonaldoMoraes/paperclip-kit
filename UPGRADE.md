# Upgrading an existing install

`install.sh` never overwrites anything. Re-running it on a repo that already has the kit adds
the files that are new in this version, skips every file that exists, refreshes
`.paperclip/kit.json`, and registers the new paths in `.git/info/exclude`. So a file the kit
*changed* stays at its old version in your install until you replace or merge it by hand.
That is on purpose: those files are your company's now, and you may have edited them.

## 0.2.0 → 0.3.0 — the build harness

**Added by a re-run** (`~/paperclip-kit/install.sh /path/to/repo`), no action needed:

- `.paperclip/HARNESS.md` — the rules, the Founder policy defaults, the Claude Code facts
- `.paperclip/orders/README.md` — the work-order template
- `.claude/agents/tech-lead.md`, `.claude/agents/critic.md`
- `.claude/commands/build.md`

**Kept at 0.2.0 — replace or merge by hand.** Compare each with the kit's copy first
(`diff -u <file> ~/paperclip-kit/template/<file>`, run from the repo root):

| File | What changed | How to take it |
|---|---|---|
| `.claude/agents/engineer.md` | **Rewritten.** The generalist became the executor: `model: sonnet`, `effort: high`, `disallowedTools: Agent`; runs only from an order; stops on a broken premise; hands back `STATUS`, surprises, red→green. The harness does not work with the old persona. | Replace it (`cp ~/paperclip-kit/template/.claude/agents/engineer.md .claude/agents/`) unless you edited it — then carry your edits onto the new file. |
| `.paperclip/briefs/_blocks.md` | New blocks Order, Tests first, Deviation, Mini-order; the Ledger block takes a `<pc>` slot; the Report block is now the executor's hand-back shape (`STATUS` first, `SURPRISES`). | Replace, or add the new blocks and merge the two changed ones. |
| `.paperclip/briefs/README.md` | Which blocks each kind of brief takes. | Replace or merge. |
| `.paperclip/PLAYBOOK.md` | Tech Lead and Critic rows; the Engineer row; the colour-reuse note; the section "How engineering work flows" before "Running work (the ledger)"; `/build` in the command list. | Merge by hand — this is the file most likely to hold your own edits. |
| `.claude/agents/cto.md` | One routing line after "In role mode you delegate". | Add the line. |
| `.claude/commands/task.md` | Triage and the Direct (mini-order) path. | Replace or merge. |
| `.claude/commands/campaign.md` | Cross-link to `/build`; an `engineer` task needs an order; sequencing wording (`pc task block` waits on a finding or the Founder, never on a task). | Replace or merge. |
| `CLAUDE.local.md`, `.claude/commands/role.md` | The roster names Tech Lead and Critic; `/build` in the running-work line. | Optional. |

Then **reload the Claude Code session**: a new agent file is only listed from the next user
turn, and an edited persona may not reload without a restart (`HARNESS.md` §10).

`/hire` needs nothing: all eight colours are taken by default, and its rule already reuses
the one least likely to run beside the new role.

## Follow-ups — not in 0.3.0

0.3.0 ships the harness on conventions over the existing `pc` (`HARNESS.md` §2, §7). Four
optional CLI additions would make them mechanical, each with tests in `pc.test.mjs`:

- `pc task surprise <id> "<text>"` — a counted surprise instead of a `surprise:` note, with
  the count in `pc status`.
- `pc finding new … --gap plan|execution` — instead of the `[plan-gap]` / `[execution-gap]`
  title prefix.
- `pc scope verify <task>` — `git diff --name-only` plus untracked files against the task's
  globs; today `tech-lead` does it by hand at the checkpoint.
- `pc gaps` — plan-gaps against execution-gaps per class and per campaign; today a grep
  (`HARNESS.md` §7).

Seen while porting, and worth deciding with them: `pc task block --on` accepts a finding or
`founder`, never another task, while `pc task new`'s scope-overlap message and
`.paperclip/work/README.md` still say "sequence them with `pc task block`" — builds sequence
by creating each slice's task when it is next instead. `pc handoff --campaign` inlines only
`contracts/`, so a build's order is named in the handoff but not inlined.

The build harness is **validated on one build** (security hardening in legacy server code).
Run a second build of a different shape — UI or feature work — before treating the
`HARNESS.md` §9 defaults as settled.
