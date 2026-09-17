---
description: Switch the active role/lens (ceo, cto, cmo, engineer, researcher, uiux, or a hired role)
argument-hint: "<role>"
---

Adopt the **`$1`** role for the rest of the conversation (until I switch). Use that role's lane + expertise as defined in `.paperclip/PLAYBOOK.md` (and `.claude/agents/$1.md` if it exists). **Stay in lane.** Confirm the switch in one line, then continue in that voice.

(Requires Paperclip ON. If `$1` isn't a known role, tell me and suggest `/hire $1`.)
