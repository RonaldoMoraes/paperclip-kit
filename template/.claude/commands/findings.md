---
description: Triage the findings queue — blockers first, grouped by area, one recommendation each
argument-hint: "[area path or severity]"
---

Run `pc finding list` (narrowed to **$ARGUMENTS** if I gave one) and triage it — this is a decision view, not a dump. `pc` is `.paperclip/bin/pc` — call it by that path if it is not on yours.

1. **Blockers first**, then defects, then nits; inside each, grouped by area — one area is usually one owner and one fix, so a grouped queue is half-routed already.
2. Each line: what it is, which task raised it, and **one recommendation** — claim it onto the task that owns that area now / fold it into the next wave / close it as not worth a wave. Open a finding's body only when the title doesn't carry the decision.
3. End with what needs **me**: findings whose fix is a judgment call, and every task currently blocked on one. If they aren't already in `.paperclip/STATUS.md` §1, put them there — a decision I can't see is a decision I can't make.

Then act on what I approve: `pc finding claim <id> --by <task>`, `pc finding fix <id>`, `pc finding close <id> --reason "<why it dies here>"`. Route by claiming, never by messaging an agent — an unclaimed defect gets re-found next wave by someone nobody told. Claiming is routing, not resolving: a finding still `open` or `claimed` keeps its campaign from closing (`pc campaign close` lists it by name), which is exactly the wave nobody should be able to call finished.
