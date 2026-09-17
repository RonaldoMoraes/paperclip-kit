# Briefs — compose, don't write

A brief is **one task-specific section plus the blocks**. The blocks in
[`_blocks.md`](_blocks.md) are the invariants — scope, ledger, findings, verification, machine
safety, research reuse, report format — and they are identical on every task, so pasting them
costs nothing to think about and writing them by hand is how the rules quietly drift apart.
The only part you author is **What to build**, and it is the only part that is actually about
this task.

## Composition

1. **Header** — role, task id, contract path, model. One line: who they are and what "done" means.
2. **What to build** — the task, in your words. Concrete: the files, the shape, the acceptance.
   If it is longer than the blocks, the task is too big — split it into two ledger tasks.
3. **The blocks, in order** — Scope · Ledger · Findings · Verification · Machine safety ·
   Research reuse · Report format. Fill `<id>`, `<you>`, `<paths>`, `<contract>`, `<N>`; change
   nothing else. Drop a block only when it cannot apply (no gates on a research-only task), and
   say why in the header rather than silently.

Everything the agent needs to survive its own death is in the blocks, so a brief stays around
250 words no matter how big the campaign is.

## One assembled brief

> **Engineer — task `w-0007`.** Contract: `.paperclip/contracts/settings-sync.md`. Done means
> the endpoint answers, its contract test is green, and `w-0007` is closed in the ledger.
>
> **What to build.** Add the `GET /api/settings` endpoint: the contract module and its mock
> beside it, the server controller/service over the existing memory store, and the contract test.
> Shapes and error reasons come from the contract file — do not design new ones. The web client
> is another task's scope; stop at the endpoint.
>
> _Scope_ — you may write only: `shared/contracts/settings/**`, `apps/server/src/settings/**`.
> Everything else in this repo is read-only to you: another task owns it, and two writers on one
> file means someone merges by hand. …*(the Scope block, verbatim)*
>
> _Ledger_ — your task is `w-0007`, and the ledger, not this transcript, is what survives you.
> Run `pc task start w-0007 --owner engineer` … *(the Ledger block, verbatim)*
>
> _Findings · Verification · Machine safety · Research reuse · Report format_ — verbatim, with
> `<N>` = 12.

Two things make this brief work and neither is in the prose: the scope list is a **write
allowlist no other live task overlaps**, and `w-0007` **existed in the ledger before the agent
was launched**. `/campaign` enforces both.

Keep an assembled brief here as `<campaign>-<task-id>.md` when it is worth re-reading — a relaunch after a rate limit, or a second agent on the same shape. `pc handoff` points a cold session at this directory.
