---
description: Hire a new department/specialist — scaffolds a persona agent + role
argument-hint: "<role> [expertise]"
---

Hire a new role named **`$1`** with expertise: **`$2`** (infer a sensible expertise if I didn't specify).

1. Write `.claude/agents/$1.md` — a concise, **self-contained** subagent persona modeled on the existing `.claude/agents/*.md` (frontmatter: `name`, `description`, `color`; body: who they are, their lane, how they work, their standards). Pick a `color` not already used by another agent in `.claude/agents/*.md` (palette: red, blue, green, yellow, purple, orange, pink, cyan); if all are taken, reuse the one least likely to run alongside this role.
2. Add `$1` (with its lane and color) to the Roles table in `.paperclip/PLAYBOOK.md`.
3. If this repo keeps Paperclip local-only, add the new agent file path to `.git/info/exclude`.
4. Confirm: the role is now usable in-chat via `/role $1` (or "$1 mode"), as a delegated subagent (Agent tool, `subagent_type: $1`), and as `--role $1` on a ledger task — a role nobody can assign work to is a persona, not a hire.
