# Brief blocks — the invariants, written once

Paste these into an agent brief **verbatim**; they are the rules that hold on every delegated task,
so writing them by hand each time is how they drift and how a brief reaches 1000 words. Fill only
the angle-bracket slots: `<id>` (the ledger task, `w-0007-…`), `<you>` (the agent's name), `<paths>`
(its write allowlist), `<contract>` (the campaign contract), `<N>` (the report's line cap).

Compose in the order below and add nothing but the task's own **What to build** — see
[`README.md`](README.md) for an assembled example.

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
`pc` is `.paperclip/bin/pc`; call it by that path if it is not on yours. Run `pc task start
<id> --owner <you>` before your first edit, `pc task note <id> "<what changed, what you
learned>"` at each real step, and close with `pc task done <id> --note "<result>"` — add
`--tokens <n>` if you can see your own count — or `pc task fail <id> --note "<why, and
where you stopped>"` if you stop early, so whoever picks this up starts from your notes
instead of from scratch. If you need the Founder to decide: `pc task block <id> --on
founder`, then stop.
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

## Report format

```
Report — at most <N> lines, in this order: what changed (one line per file, absolute
paths); the commands you ran, each with pass or fail; what is still red and why; the
decisions you had to make where the contract was silent. No code dumps, no recap of what
you read, no restating the brief back to me. If you ran out of scope, context or time,
say exactly where you stopped — your ledger notes plus this report are the entire handoff,
and anything you leave out only exists in a transcript nobody will read.
```
