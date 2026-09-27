# Run conditions

This session runs unattended. Nobody answers questions while it runs: the operator only sends the next phase's instruction.

- Whenever you would ask the user (or Founder) a question or wait for an approval, choose the option you would recommend, write one line `Decided: <choice> — <why>`, and keep going.
- Already decided: work in this checkout, not in a git worktree. A local branch or local commits are fine if your process makes them. Never push, open a PR, deploy, or merge anywhere else.
- Database: Postgres is already running. `DATABASE_URL` in `.env` points at a database of this checkout's own, which you may migrate and reset freely. That satisfies the repo's "own database for a schema change" rule, so you don't need a worktree for it. Don't start, stop or remove any Docker containers.
- The work runs in three phases, one per message: **plan**, **implement**, **verify**. Do only the current phase's work. When the phase is finished, including any background agents you started, make the last line of your reply exactly `PHASE-DONE: <phase>`.
