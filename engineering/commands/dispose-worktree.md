---
description: "Remove the worktree directory, keeping the branch"
---

Reclaim the current worktree's directory. **The branch survives.**

Run from **inside the worktree** you want to remove:

```bash
yarn wt dispose
```

The command refuses when there is work it would strand:
- uncommitted or untracked changes
- commits not pushed to the branch's upstream
- a branch that was never pushed at all

Publish first with `/publish-worktree`, or pass `--force` to discard the directory
anyway (the branch is still kept).

This will:
1. Verify nothing would be lost
2. Stop the worktree's stack and release its port slot
3. Remove the worktree directory
4. Leave the branch in place, and print how to re-attach a worktree to it later

A worktree that ran with its own database (`yarn wt run --db`) keeps that database until
you drop it: `yarn wt stop --drop-db` before disposing.

**A feature branch lives until its change is in production** — it is what a rollback or
re-deploy is cut from. Do not delete it after the merge into the trunk.

Work reaches the trunk only through a PR — this command never merges anything.

See `docs/worktrees.md` and `docs/branching.md`.
