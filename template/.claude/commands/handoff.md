---
description: End the session so the next one — any provider, any machine — starts warm
---

1. Update `.paperclip/STATUS.md`: §2 rows reflect reality (plan progress, what's blocked), anything waiting on the Founder is in §1 with a recommendation, finished work moves to §4, and §5 lists the next moves. Set **Last updated**.
2. Write the handoff: where we stopped, what's next, what failed or was ruled out, and open questions.
   - **With ai-memory** (tools named `memory_*`): write it through its handoff (the `ai-memory-handoff` skill, when installed), so the next session's start picks it up.
   - **Without**: write `.paperclip/HANDOFF.md`, replacing the previous one.
3. Show `.paperclip/bin/panel --compact`, and say in one line what the next session should do first.
