# work/ — one file per task

The unit of work a single agent owns. A task file is the durable state of that work:
if the agent is killed by a rate limit, a model switch or a crash, this file — not a
transcript — is what the next agent reads to pick it up.

Written by `pc task …` (`.paperclip/bin/pc` — call it by that path if it is not on yours).
Hand-editable; `pc` parses forgivingly.

## File name and id

`.paperclip/work/w-<seq4>-<slug>.md` — the id is the filename without `.md`
(`w-0042-payments-stripe`). Sequence numbers are allocated by `pc task new`, which
retries on a collision rather than locking, so parallel agents can create tasks at the
same moment.

## Schema

```
---
id: w-0042-payments-stripe
title: Build the payments-stripe module
campaign: c-0003-payments-wave              # optional — the fan-out this belongs to
class: module-build                         # the estimate bucket — see log/README.md
role: engineer
model: <model name>                         # optional — what it ran on, for cost per class
status: queued | running | blocked | done | failed
owner: agent:<agentId> | founder | unassigned
started: <iso8601>                          # absent until started
ended: <iso8601>                            # absent until done/failed
scope:                                      # file-path allowlist, one per line
  - skeleton/modules/payments-stripe/**
contract: .paperclip/contracts/<name>.md    # optional
gates: [typecheck, lint, test]              # optional
blocked_on: f-0007-… | founder              # only when status: blocked
---
## Goal
## Done when
- [ ] …
## Notes
- <iso> — append-only entries, newest last
```

## Rules

- **`## Notes` is append-only.** Never rewrite or delete a note; `pc task note` appends
  a timestamped line. History is the recovery record.
- **`scope` is a write allowlist, and it is enforced.** An agent working this task writes
  only those paths; anything it finds outside them becomes a finding, not an edit. `pc task
  new` **refuses** a `--scope` glob that overlaps the scope of any `queued`, `running` or
  `blocked` task, naming the task and the two globs — one writer per file is the campaign
  rule that costs the most when it is checked by eye. `--force` accepts an overlap
  deliberately and records it in the notes of *both* tasks. Test a partition before you
  create anything with `pc scope check "<glob>"…`.
- **A task with no `scope` is warned about, not refused.** It claims no paths, so nothing
  protects its files from the next task; add the allowlist as soon as you know it.
- **One owner at a time.** `pc task start --owner agent:<id>` claims it. A killed agent
  leaves `running` with a `started` and no `ended` — that is exactly how `pc status`
  shows you what was interrupted.
- **Blocked means blocked on something nameable.** `pc task block <id> --on <finding-id>`
  or `--on founder`. Never leave a task stalled without a `blocked_on`.
- **Terminal states are logged.** `pc task done|fail` appends one line to
  `../log/tasks.jsonl`; that is where estimates come from. Pass `--tokens` (and `--model`
  if it changed) at close so cost per class is measured rather than asserted.
- Status transitions are idempotent — `done` twice says so and changes nothing.

## The commands you actually use

```
pc task new "<title>" --class <c> --role <r> [--scope <glob>]… [--campaign <c-id>]
                      [--model <name>] [--gates a,b]
pc scope check "<glob>"…      # does this partition collide? same answer, before you commit
pc task start <id> --owner agent:<you>
pc task note  <id> "<what you learned>"
pc task block <id> --on <finding-id|founder>
pc task done  <id> [--tokens <n>]   # or: pc task fail <id> --note "<why>"
pc task list  [--status running] [--class module-build] [--campaign <c-id>] [--json]
```

A refused overlap looks like this — the message is the feature:

```
$ pc task new "Plan screen copy" --class doc-pass --role uiux --scope 'apps/web/src/plan/copy.ts'
pc: scope overlap — one writer per file, and these live tasks already claim what this one would write:
  w-0031-plan-screens (running)  Port the plan screens
      apps/web/src/plan/copy.ts  overlaps  apps/web/src/plan/**
  If they genuinely need the same file they are one task; otherwise narrow the scope or
  sequence them with `pc task block`. `--force` accepts the overlap deliberately and
  records it in the notes of both tasks.
```
