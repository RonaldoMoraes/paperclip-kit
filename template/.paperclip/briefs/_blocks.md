# Brief blocks — the invariants, written once

Paste these into an agent brief **verbatim**; they are the rules that hold on every delegated task,
so writing them by hand each time is how they drift and how a brief reaches 1000 words. Fill only
the angle-bracket slots: `<id>` (the ledger task, `w-0007-…`), `<you>` (the agent's name), `<pc>`
(`.paperclip/bin/pc`, or from a worktree `PAPERCLIP_DIR=<primary>/.paperclip <primary>/.paperclip/bin/pc`),
`<paths>` (its write allowlist), `<contract>` (the campaign contract — for a build, the order),
`<N>` (the report's line cap), and the build slots named in each block below.

Which blocks a brief takes depends on its kind — a campaign task, a build slice, a Direct
mini-order, a planner, a critic — and [`README.md`](README.md) lists them, with an assembled
example. A campaign brief adds the task's own **What to build**; a build or Direct brief adds
nothing, because the order or the mini-order already says it.

**One home per rule.** A persona (`.claude/agents/<role>.md`) says how its role behaves; a
block carries what this task binds it to. The build blocks (Order, Tests first, Deviation,
Mini-order) are slots and nothing else — the executor's discipline behind them is in
`.claude/agents/engineer.md`, and it is not repeated here.

---

## Scope

```
Scope — you may write only: <paths>. Everything else in this repo is read-only to you:
another task owns it, and two writers on one file means someone merges by hand. If the
fix you need lives outside that list, report it as a finding (below) and keep going —
never patch it, never "just rename" a shared file, never widen your own scope. That list
was checked against every live task before you launched, so inside it you are the only
writer and outside it you are not — which is the whole reason it is a list. Your
contract is <contract>: when it and the code disagree the contract wins, and when it is
silent say so in your report instead of inventing a convention the next agent won't share.
```

## Ledger

```
Ledger — your task is <id>, and the ledger, not this transcript, is what survives you.
Below, `pc` means <pc>. Run `pc task start <id> --owner <you>` before your first edit,
`pc task note <id> "<what changed, what you learned>"` at each real step, and close with
`pc task done <id> --note "<result>"` — add `--tokens <n>` if you can see your own count —
or `pc task fail <id> --note "<why, and where you stopped>"` if you stop early, so whoever
picks this up starts from your notes instead of from scratch. If you need the Founder to
decide: `pc task block <id> --on founder`, then stop.
```

## Findings

```
Findings — a defect outside your scope goes in the queue, never in a message to the
coordinator: `pc finding new --from <id> --area <path> --severity blocker|defect|nit
--title "<one line>"`, detail on stdin (what you saw, where, how to reproduce). The
coordinator routes it to whoever owns that area. Before you fix anything in another
task's area, claim it first — `pc finding claim <f-id> --by <id>` — because an unclaimed
fix is exactly how two agents edit one file. Blocked by one: `pc task block <id> --on <f-id>`.
```

## Verification

```
Verification — proof proportional to the change: a one-file edit needs the gate that
covers it; a new seam needs its test written before you call it done. Run the gates named
on your task and paste the command with its real output — "should pass" and "looks green"
are claims, not results, and a green you did not watch is a lie the next agent inherits.
If a gate fails outside your scope, report which command and the failing lines; a known
red is worth more than a silent one. Prefer the scoped run over the whole suite.
```

## Machine safety

```
Machine safety — this is the Founder's machine, with siblings running on it. Kill only
PIDs you started yourself; never `pkill -f <pattern>` and never kill by process name —
you will take out an editor, a sibling agent mid-write, or the Founder's own server. A
port already listening is someone else's until proven otherwise: use it read-only or pick
another, don't free it. Stop what you started before you finish, and say in your report
what you started and what you deliberately left running.
```

## Research reuse

```
Research reuse — read `.paperclip/research/` before you derive anything: "how does X work
here" has usually been paid for already, and re-deriving it bills the campaign twice. When
you learn a durable fact — an API shape, a version pin, a vendor limit, a measured number,
a screen inventory — write it to `.paperclip/research/<topic>.md` with where it came from,
so the next agent reads it in seconds. Facts belong in files; only the reasoning that got
you there belongs in this transcript, and this transcript is thrown away.
```

## Order

Build slices and Guided work. Slots: `<order>` (absolute path), `<slice>`, `<in-flight>`,
`<where>`.

```
Order — <order>, slice <slice>; your ledger task is <id>. In flight beside you: <in-flight>.
Working directory: <where>.
```

## Tests first

Slots from the slice's "Tests first" and gate lines in the order.

```
Tests first — <test file › test name> must fail before the change and pass after.
Red: `<exact command>` → <the failure expected>. Green: the same command → ≥ <count> passed.
```

## Deviation

Slot: `<limit>` — the surprise limit in `.paperclip/HARNESS.md` › Founder policy, copied
whole, the closed-decision clause included.

```
Deviation — surprise limit for this task: <limit>. Log each surprise when you meet it:
`pc task note <id> "surprise: <what the order implied> → <what the code does>"`.
```

## Mini-order

The Direct tier (`.paperclip/HARNESS.md` §1): the whole order in about ten lines.

```
Mini-order — task <id>.
Change: <what, where — file paths>
Why: <one line>
Verify: `<exact command>` → <expected>
Stop if: <what would mean this is not micro>
```

## Report format

```
Report — at most <N> lines, in this order:
STATUS: done | blocked | not micro | no order
STEPS: each step of your order ✓ / ✗
GATES: `command` → pass | fail | not run, with the decisive lines of the real output
RED→GREEN: the failing run, then the passing run (when a test had to fail first)
SURPRISES: every place the code differed from what the order or contract implied — even
the ones you handled
DISCOVERIES: the ids of the findings you filed
DECISIONS: what you had to decide where the order or contract was silent
FILES: one line per file touched, absolute paths
LEFT: what is still red and why, and exactly where you stopped
No code dumps, no recap of what you read, no restating the brief back to me. Your ledger
notes plus this report are the entire handoff, and anything you leave out only exists in
a transcript nobody will read.
```
