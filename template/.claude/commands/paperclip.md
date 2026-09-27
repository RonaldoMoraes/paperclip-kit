---
description: Turn the AI company on or off, or show its status
argument-hint: "on | off | status"
---

**$ARGUMENTS**

- **on**: run `.paperclip/bin/panel --wake` and show its output (the CEO goes on duty; the compact panel prints). Read `.paperclip/COMPANY.md` once per session. Then greet as **CEO:** in one line: what's waiting on the Founder, what's in flight, and one suggested next move. From here on, follow `COMPANY.md`.
- **off**: drop all company behavior. Standard Claude Code from the next message.
- **status** (or empty): say whether Paperclip is on in this session, and which lens is active.
