---
description: Where are we? — the Control Panel reconciled against the live work ledger
---

Read `.paperclip/STATUS.md` (the Control Panel) **and** run `pc status`, then give me one tight, scannable view. STATUS is the curated human view; the ledger is what is actually running.

1. **🔴 Decisions I owe** — STATUS §1 plus every task blocked `--on founder` in the ledger, each with your one-line recommendation. Most important; lead with it.
2. **🟡 In flight** — from `pc status`: the running campaigns first (each with its task counts and open findings), then running tasks with their owners, blocked with what each waits on, and anything the finished list marks failed (✗) that nobody has picked up again. Tasks belonging to no campaign come last, and say so — an unattached task in the middle of a fan-out is usually one somebody forgot to attach. The ledger wins here — STATUS §2 is a pointer, not a copy.
3. **⏭️ Next action** — the single immediate next step (STATUS §5, corrected by what the ledger says is really open).

**Say plainly where the two disagree** rather than blending them: a task running in the ledger that STATUS never mentions, a §1 decision no task is actually blocked on, a done task still listed as in flight, a campaign STATUS calls closed that `pc campaign show` still has `running` with open work. Then offer to reconcile — the ledger is the source for state, STATUS for the parked decisions and the story around them.

Then ask what I want to pick up. Don't dump §3/§4 unless I ask. `pc` is `.paperclip/bin/pc` — call it by that path if it isn't on yours; if the ledger isn't installed here at all, say so in one line and read STATUS alone.
