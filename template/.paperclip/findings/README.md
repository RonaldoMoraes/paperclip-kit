# findings/ — one file per cross-agent defect

A finding is a defect that agent A discovers in agent B's area. It exists so the
coordinator never has to relay defects by hand: A writes the file and keeps going,
B picks it up from `pc status`.

Written by `pc finding …` (`.paperclip/bin/pc` — call it by that path if it is not on
yours). Hand-editable; `pc` parses forgivingly.

## What is and is not a finding

- **Is:** a real defect outside your task's `scope` — a broken contract, a type that
  does not compile against its consumer, a missing export, a rule the golden path
  breaks. Anything you would otherwise have to interrupt a human to relay.
- **Is not:** something inside your own scope (just fix it); a question for the Founder
  (that is `pc task block <id> --on founder`); or a thing you learned from reading
  (that goes in `../research/`).

## File name and id

`.paperclip/findings/f-<seq4>-<slug>.md` — the id is the filename without `.md`
(`f-0007-narrow-session-strips-extras`).

## Schema

```
---
id: f-0007-narrow-session-strips-extras
title: Narrow session strips extras
raised_by: w-0042-payments-stripe            # the task that hit it
owner_area: skeleton/modules/auth-better-auth # the path that owns the fix
owner_task: w-0031-auth-seams | unassigned
severity: blocker | defect | nit
status: open | claimed | fixed | wontfix
---
## What
## Evidence        (verbatim command + error)
## Suggested fix
```

## Rules

- **Evidence is verbatim.** Paste the exact command and its exact output. A finding
  another agent cannot reproduce from the file is a rumour.
- **`owner_area` is a path, not a person.** Whoever owns that path owns the fix; the
  area is how `pc status` groups open findings.
- **Severity is a routing decision.** `blocker` = somebody is stopped right now (raise it
  and block the task on it); `defect` = wrong but workable; `nit` = note it and move on.
- **Claim before fixing.** `pc finding claim <id> --by <task-id>` — claiming a finding
  another task already claimed is refused unless you pass `--force`. Two agents fixing
  the same defect is the failure this prevents.
- `fixed` means the fix has landed. `wontfix` needs a reason (`pc finding close --reason`).
  Both are terminal: a finding left `open` or `claimed` keeps its campaign from closing
  (`pc campaign close` lists it), which is the point — nobody declares a wave finished over
  a defect that is only routed.
- The body is append-only in spirit: add to `## Notes`, do not rewrite the evidence.

## The commands you actually use

```
pc finding new --from <task-id> --area <path> --severity blocker --title "<t>"  < body-on-stdin
pc finding claim <id> --by <task-id>
pc finding fix   <id> --note "<what changed>"
pc finding close <id> --reason "<why not>"
pc finding list [--status open] [--area <path>] [--json]
```

Raising a blocker usually comes in a pair:

```
pc finding new --from w-0042 --area skeleton/modules/auth-better-auth \
  --severity blocker --title "Narrow session strips extras" <<'EOF'
## What
narrowSession() drops fields the payments module needs.
## Evidence
$ yarn typecheck
src/webhook.ts(31,18): error TS2339: Property 'plan' does not exist on type 'Session'.
## Suggested fix
Widen the return type, or export a second helper.
EOF
pc task block w-0042 --on f-0007-narrow-session-strips-extras
```
