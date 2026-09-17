---
name: worktrees
description: Cutting, running, publishing and disposing of git worktrees with the `wt` CLI (`yarn wt`) — one branch per worktree, its own port slot, its own database when the branch touches the schema, evidence attached to the PR. Load when a change needs its own checkout, when a stack must run beside another, when a PR is being opened from a worktree, or when a worktree is being cleaned up.
---

# Worktrees

The primary checkout stays on the trunk and is never worked in: it is the base
worktrees are cut from and the source of the `.env` files. Every change is a
worktree. `wt` (`yarn wt`, `scripts/wt/wt`) is the single entry point for that
lifecycle and for running the stack. The full manual is `docs/worktrees.md`;
the branch rules are `docs/branching.md`; the product's names (trunk,
processes, ports, database) are `scripts/wt/wt.config.sh`.

## When to cut a worktree

- Any change that will become a PR. One branch, one worktree, one PR.
- Work that must run beside another stack — a second feature under test, an
  agent validating in parallel — because every worktree gets its own port slot.
- Epic sub-work: cut from the epic branch (`--from <epic>`); the PR then
  targets the epic.

Do not work in the primary checkout, and do not start an app outside `wt run`:
it would bind the primary's ports and collide with whatever else is running.

## The commands

| Command | Where | What |
| --- | --- | --- |
| `yarn wt create <branch> [--from <base>] [--local]` | primary | cut the branch from `origin/<base>` (default: the trunk), add the worktree, allocate a slot, symlink `.env`, install |
| `yarn wt provision [--path <dir>]` | anywhere | make a worktree someone else created usable (agent worktree support, plain `git worktree add`) |
| `yarn wt run [--with <proc>] [--only <list>] [--auto-db\|--db\|--shared-db]` | worktree | bring the stack up on the slot's ports (foreground; Overmind owns the terminal) |
| `yarn wt health` | worktree | poll the stack until every process answers |
| `yarn wt status` / `yarn wt logs <proc>` | worktree | what is running / attach to one process |
| `yarn wt stop [--drop-db]` | worktree | stop the stack, restore the `.env` symlinks |
| `yarn wt publish [--to <branch>] [--body-file <md>] [--attach <file>]...` | worktree | push and open the PR |
| `yarn wt dispose [--force]` | worktree | remove the directory; the branch survives |

Every command answers `--help`. Every command acts on the checkout the current
directory belongs to, so **work from inside the worktree** — `cd` into it and
run commands there; never `cd <worktree> && …` from the primary checkout and
never point a command at a worktree from outside except `wt provision --path`.

Branch names are semantic: `<type>/<TICKET>-short-name` with the types listed
in `wt.config.sh` (`feat fix refactor test docs chore` by default); `docs/` and
`chore/` need no ticket. `create` refuses anything else.

## The `--db` rule

Every worktree shares one local database by default. A branch that changes the
schema directory (`WT_DB_SCHEMA_DIR` in `wt.config.sh`, `db/prisma` by default)
must run with `yarn wt run --db`: its migrations land on its own database on
the same Postgres, never on the shared one. `wt run` refuses such a branch
without `--db`; `--auto-db` lets it decide from the diff (what launchers that
cannot know the branch pass); `--shared-db` overrides deliberately. `wt stop
--drop-db` removes the worktree's database. A product without a database
module (no `docker-compose.db.yml`) has none of this.

## Evidence

Proof of the change travels with the PR, never with the branch:

1. Save screenshots and recordings under `<worktree>/.wt/evidence/`
   (`.wt/` is gitignored).
2. Write the PR body in `<worktree>/.wt/pr.md` along the template's sections
   (What / Why / How to test / Evidence / Risks / Checklist), referencing each
   file from Evidence as `![what it shows](./.wt/evidence/name.png)`.
3. `yarn wt publish --body-file .wt/pr.md --attach .wt/evidence/name.png`
   (one `--attach` per file; `gh` 2.99.0+). A PR that is already open gets the
   evidence as a comment.

The description is a 30-second read: what changed and why, what the reviewer
cannot see in the diff — not a file listing.

## Cleaning up

`yarn wt stop` when the stack is not needed; `yarn wt dispose` when the
directory is not. Dispose refuses uncommitted or unpushed work unless
`--force`, and always keeps the branch — a feature branch lives until its change
is in production, because that is what a rollback is cut from.
