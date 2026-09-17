---
description: Log a formal decision in the decision log
argument-hint: "<the decision>"
---

Append a new numbered entry to `.paperclip/decisions.md` for: **$ARGUMENTS**.

Use the existing format (next number · **Date** · **By** · **Context** · **Decision**). Infer the Context and rationale from our conversation; ask me only if the *why* is genuinely unclear. Keep it tight. If the decision parks or unblocks something, update `.paperclip/STATUS.md` §1 accordingly — and if a task was blocked on me for it, `pc task unblock <id> --note "<the call>"`, because a decision that never reaches the ledger leaves an agent waiting on nothing.
