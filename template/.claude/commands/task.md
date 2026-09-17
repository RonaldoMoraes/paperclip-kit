---
description: The work ledger — list what's in flight, show one task, or open a new one from a sentence
argument-hint: "[list | show <id> | <a sentence describing the work>]"
---

Read **$ARGUMENTS** and pick one (`pc` is `.paperclip/bin/pc` — call it by that path if it is not on yours):

- **empty or `list`** — run `pc task list` and give me the queue in one screen: blocked first with what each is blocked on, then running with its owner, then what closed since I last looked. Summarize it; I can read a table myself if I want one.
- **`show <id>`** — run `pc task show <id>`: state, owner, campaign, scope, gates and the notes so far, plus the ledger file path (`.paperclip/work/<id>-*.md`) so I can read it cold or hand it to a fresh agent.
- **anything else** — treat it as a new task. Infer the class, the role that should own it, and the write allowlist from the sentence and the repo; confirm those three plus the title back to me in one line before creating anything. Run `pc scope check "<glob>"…` first — one writer per file, and the ledger enforces it: `pc task new` refuses a scope that overlaps a queued, running or blocked task and names both globs. If it refuses, bring me the collision and your recommendation (narrow it, fold the two into one task, sequence them with `pc task block`) rather than reaching for `--force`. Then `pc task new "<title>" --class <c> --role <r> --scope <glob>` (add `--campaign` when it belongs to a fan-out, `--contract` and `--gates` when a contract covers it, `--model` when you know what it will run on) and tell me the id.

Opening a task is not launching one. If I want it worked now, say so and compose the brief from `.paperclip/briefs/_blocks.md` — never hand-write the invariants.
