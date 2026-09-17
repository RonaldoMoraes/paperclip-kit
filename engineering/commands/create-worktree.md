---
description: "Cut a feature branch from the trunk and provision a worktree for it"
argument-hint: "<branch-name> e.g. feat/ABC-1234-short-name"
---

Create a feature branch and an isolated worktree to work on it.

Run from the **primary checkout** (not from inside a worktree):

```bash
yarn wt create $ARGUMENTS
```

The branch name is required and must be semantic — the command rejects anything else,
because this branch outlives the worktree and goes on the PR:

| Prefix | For |
| --- | --- |
| `feat/ABC-1234-name` | features |
| `fix/ABC-1234-name` | bugfixes and hotfixes |
| `refactor/ABC-1234-name` | technical refactors |
| `test/ABC-1234-name` | tests |
| `docs/name` | documentation only (no ticket) |
| `chore/name` | maintenance, infra, tooling (no ticket) |

This will:
1. Fetch `origin/<trunk>` and cut the branch from that tip — not a stale local ref
   (`--local` cuts from your local trunk instead, e.g. to test an unpushed local
   merge; it warns when that branch is behind origin)
2. Create a worktree at `$WT_WORKTREE_BASE/<repo-prefix>-<branch-with-dashes>`
   (default base `~/worktrees`; prefix from `scripts/wt/wt.config.sh`)
3. Allocate a port slot (1-9) so this worktree's stack does not collide with any other
4. Install dependencies and symlink the `.env` files from the primary checkout

No build step: `yarn wt run` syncs dependencies when it has to.

Pass `--from <base>` for epic sub-work. Branching from `main` warns — `main` is production
and behind the trunk — in both modes.

If the worktree already exists — made by a coding agent or by `git worktree add` — skip
this command and provision it directly:

```bash
yarn wt provision --path <worktree-dir>
```

After creation, work **from inside** the worktree (`cd` into it; never drive it from the
primary checkout):
- Start the stack: `yarn wt run` (add `--with metro` for the mobile app, or `--only web`)
- A change under the schema directory (`db/prisma` by default) must run with `yarn wt run --db`
- Gates: `yarn typecheck`, `yarn lint`, `yarn test` — see the project's `AGENTS.md`

When the work is ready, `/publish-worktree`.

See `docs/worktrees.md` and `docs/branching.md`.
