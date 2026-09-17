# campaigns/ — one file per fan-out

A campaign is the thing a wave of parallel tasks belongs to. Without it, tasks are grouped
only by the contract they happen to name: nothing can say "these twenty-five agents are one
piece of work", and nothing can stop somebody calling it finished while a task is still
running or a finding it raised is still open.

Written by `pc campaign …` (`.paperclip/bin/pc` — call it by that path if it is not on
yours). Hand-editable; `pc` parses forgivingly.

## File name and id

`.paperclip/campaigns/c-<seq4>-<slug>.md` — the id is the filename without `.md`
(`c-0003-port-the-plan-flow`). Sequence numbers are allocated by `pc campaign new` the same
way task and finding ids are, so two coordinators cannot collide.

## Schema

```
---
id: c-0003-port-the-plan-flow
title: Port the plan flow
status: running | closed
contract: .paperclip/contracts/plan-flow.md   # the seam every task builds against
started: <iso8601>
ended: <iso8601>                              # absent until closed
---
## Goal
What this campaign delivers, in the coordinator's words.

## Tasks
The intended decomposition, one line per task and the paths it owns — written before the
fan-out. `pc campaign show <id>` prints the live list instead, read from the task files.

## Notes
- <iso> — append-only entries, newest last
```

## Rules

- **Membership lives on the task, not here.** `pc task new … --campaign <id>` writes
  `campaign:` into the task's frontmatter, and that is the only truth `pc` reads. The
  `## Tasks` section is the plan; `pc campaign show` is the state. Nothing rewrites this
  file when a task is created, so twenty-five agents creating tasks at once cannot tear it.
- **A campaign is closed only when its work is.** `pc campaign close` refuses while any of
  its tasks is not `done` or `failed`, or any finding one of its tasks raised is still
  `open` or `claimed` — and lists exactly what is unresolved. `--force --reason "<why>"`
  closes over it and writes the reason into `## Notes`, because a forced close with no
  reason is a lie in the ledger.
- **A closed campaign takes no new tasks.** `pc task new --campaign <closed-id>` is refused;
  open a new campaign for follow-on work. Otherwise "closed" means nothing an hour later.
- **The contract comes first.** `pc campaign new` warns when you give it no `--contract`:
  every drift in a campaign happens where the contract was silent.
- `pc status` groups every bucket by campaign, unattached tasks last, so a fan-out reads as
  one thing rather than twenty-five unrelated rows.

## The commands you actually use

```
pc campaign new "<title>" --contract .paperclip/contracts/<name>.md
pc task new "<title>" --class <c> --role <r> --scope <glob> --campaign <c-id>
pc campaign show <id>            # goal, live task list, open findings it raised
pc campaign list [--json]
pc campaign close <id>           # refuses while anything is open
pc handoff --campaign <id>       # a brief scoped to this fan-out alone
```

Closing one usually looks like this:

```
$ pc campaign close c-0003-port-the-plan-flow
pc: campaign c-0003-port-the-plan-flow still has open work — refusing to close it
  tasks not done or failed (1)
      w-0031-mobile-port  blocked on f-0004-copy-key-mismatch  Port the plan screen to mobile
  findings its tasks raised, still open (1)
      f-0004-copy-key-mismatch  blocker  claimed  Copy keys differ between web and mobile
  Finish or fail every task, and fix or close every finding, then close the campaign.
  `--force --reason "<why>"` closes over them and records the reason in the campaign notes.
```
