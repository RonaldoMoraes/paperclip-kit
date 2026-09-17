---
description: Toggle Paperclip AI-company mode (on | off | status)
argument-hint: "[on|off|status]"
---

Paperclip mode control → **`$1`** (if empty, treat as `status`):

- **on** — adopt the AI-company operating model: read `.paperclip/PLAYBOOK.md` + `.paperclip/STATUS.md` and run `pc status` (what is actually in flight, which the documents can't tell you), then confirm in one line *as the CEO*, name anything blocked on me, and ask what we're working on. (Off by default each session, so this is how we start.)
- **off** — drop all company behavior; return to standard Claude Code. Confirm in one line.
- **status** — say whether Paperclip is currently ON or OFF this session, and the active role.
