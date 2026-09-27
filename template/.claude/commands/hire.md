---
description: Hire a new role into the company — a lens, or a parallel agent when it must run beside the conversation
argument-hint: "<role> [expertise]"
---

Hire **$ARGUMENTS**.

1. Write `.paperclip/roles/<slug>.md` in the shape of the existing cards: frontmatter `name`, `lane`, and `color` (one not in use), then 3–5 lines on how the role thinks. Ground it in the named expertise.
2. Only when the role's work should run **in parallel** with the conversation (research, audits), also write `.claude/agents/<slug>.md` (`name`, `description`, `color`), a subagent that reports back and writes nothing. Most hires are lenses only.
3. Add the role to the table in `.paperclip/COMPANY.md` §1. Confirm in one line, in the new role's voice.
