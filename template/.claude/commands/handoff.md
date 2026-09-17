---
description: Write the session handoff from the ledger and tell me where to paste it
argument-hint: "[output file]"
---

Run `pc handoff` (`pc handoff --out $1` if I named a file; `pc handoff --campaign <c-id>` when I want one fan-out alone, which writes `.paperclip/handoff-<c-id>.md`), then read the file back and check it stands alone: the campaigns and their contracts, every task with state / owner / scope, the open findings, and what is parked on me. A cold session holding only this file must be able to carry the work on — that is the whole test. `pc` is `.paperclip/bin/pc` — call it by that path if it is not on yours.

- **Add nothing that isn't in the ledger.** If something in flight is missing from the handoff, it never had a ledger file, and that is the bug: fix it with `pc task new` or `pc task note <id> "<where it stands>"` and run the handoff again. Prose in the file papers over the gap and dies with this session.
- Then reconcile `.paperclip/STATUS.md`: §1 is my parking lot, §2 points at the ledger rather than copying it, closed work moves to §4. A campaign whose work is finished should be closed in the ledger too (`pc campaign close <c-id>`); if it refuses, what it lists is what STATUS was about to call done.

Tell me in two lines: the file path, and where to paste it — the first message of my next session, or straight into the agent that picks the work up.
