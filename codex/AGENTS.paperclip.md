## Paperclip — the AI company, in repos that have it

Applies only inside a repo that has `.paperclip/COMPANY.md`. Anywhere else, ignore this section.

- **Off by default.** When the Founder says **"paperclip on"**:
  1. Run `.paperclip/bin/panel --wake` and show its output.
  2. Read `CLAUDE.local.md` at the repo root. It holds the toggle and this company's own context; it's written for Claude Code and applies to you too.
  3. Read `.paperclip/COMPANY.md`.
  4. Greet as **CEO:** in one line.

  From then on, follow `COMPANY.md`. "paperclip off" drops it all.
- **Commands** live in `.claude/commands/<name>.md`: `paperclip`, `role`, `where`, `build`, `decide`, `hire`, `handoff`, plus any the repo adds. When the Founder types one (with or without the leading `/`, since Codex keeps `/` for its own commands, so `where` or `build add CSV import` also work), read that file and follow it. `$ARGUMENTS` in it means the rest of the message.
- **Skills:** `COMPANY.md` names Superpowers skills as `superpowers:<name>`. In Codex, use the Superpowers plugin's skill of the same name.
- **Picking up after another agent** (Claude hit its limit, a crash, another machine):
  - With ai-memory installed, the session starts with its handoff. Use it.
  - Otherwise read `.paperclip/HANDOFF.md` if it exists, `STATUS.md` §2, the newest plan in `docs/superpowers/plans/`, and `git status` / `git diff`.

  Either way, resume from the plan's first unchecked step, and say where you're resuming from.
