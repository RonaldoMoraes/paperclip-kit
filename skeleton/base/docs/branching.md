# Branching and pull requests

`__TRUNK__` is the trunk. Every change lives on its own branch cut from `__TRUNK__`, returns
to `__TRUNK__` through a pull request when it is finished, and reaches production as part of
the next release cut.

## The chain

```
__TRUNK__ ──┬─> feat/ABC-1234-thing ──> PR ──> epic branch ──> PR ──┐
  (trunk)   └─> fix/ABC-1235-other ───────────────────────> PR ──┴─> __TRUNK__ ──> releases/vX ──> main
                                                                     (testing)     (staging)      (prod)
```

- **`__TRUNK__`** is the trunk and the shared testing environment. It is the base for every
  new branch — including epic branches — and the only target developers open PRs into.
  Merging here builds and deploys the testing environment.
- **Epic branch** aggregates the feature branches of one epic. Optional for standalone work.
- **`releases/vX`** (e.g. `releases/v1.4.0`) is the staging branch for release X. It is cut
  from `__TRUNK__` by the release owner; everything in `__TRUNK__` at that moment is in the
  release. Work that is not finished by then is finished on the release branch.
- **`main`** is production. Tag `vX` marks what is deployed. Nobody branches from `main` or
  merges into it — the release flow does.

## Create a branch

Every change is a worktree, so the branch is cut by `yarn wt create` from the primary
checkout (see [worktrees.md](worktrees.md)):

```bash
yarn wt create feat/ABC-1234-short-feature-name
yarn wt create feat/ABC-1235-sub-task --from feat/ABC-1200-epic   # epic sub-work
```

It cuts from `origin/__TRUNK__` (or the epic branch), never from a stale local ref, and
refuses a branch name that is not semantic.

## Branch names

Semantic branch names, with the ticket key where one exists:

| Prefix | For | Example |
| --- | --- | --- |
| `feat/` | Features | `feat/ABC-1234-appointment-reminders` |
| `fix/` | Bugfixes and hotfixes | `fix/ABC-1235-token-expiration` |
| `refactor/` | Technical refactors | `refactor/ABC-1236-service-layer` |
| `test/` | Tests | `test/ABC-1237-login-smoke` |
| `docs/` | Documentation only | `docs/branching-flow` |
| `chore/` | Maintenance, infra, tooling | `chore/bump-node-22` |

`docs/` and `chore/` don't need a ticket key. The types and the ticket pattern live in
`scripts/wt/wt.config.sh` (`WT_BRANCH_TYPES`, `WT_TICKET_RE`); the PR title is derived from
the branch (`feat/ABC-1234-short-name` → `feat(ABC-1234): short name`).

## Stay current

Merge `__TRUNK__` into your branch regularly, and always before opening the PR:

```bash
git fetch origin
git merge origin/__TRUNK__
```

Resolve conflicts on your branch. A branch that is far behind `__TRUNK__` conflicts at PR
time; a branch that merges it often conflicts in small pieces. `wt publish` warns, with a
count, when the branch is behind its target.

## Commit and push

Commit messages follow the repo convention in `AGENTS.md` — `type(scope): subject`, lowercase
imperative, no trailing period. Small logical commits; tests ride with the code they test.

Pushing and opening the PR is one command from inside the worktree: `yarn wt publish`
(see below). A plain `git push -u origin <branch>` works too.

## Open a pull request

**Merging into `__TRUNK__` means "in the next release".** A PR opens only when the feature
is complete and the developer has validated it in their own environment — behaviour and
visuals, checked against the design source of truth. Work that has to land before it is
complete ships behind a feature flag.

**One PR per finished feature.** An epic becomes several feature branches, each with its own PR
into the epic branch. When the epic is complete, one PR takes it to `__TRUNK__`. Avoid one
giant PR mixing several features — it can't be reviewed and it can't be reverted cleanly.

**Write the description as a 30-second read.** State what changed and why, and give the
reviewer the context they can't get from the diff — a decision you made, a risk, something to
look at first. Don't narrate the changed files: the diff already lists them, and a description
that reads like a file listing is one nobody reads. `.github/PULL_REQUEST_TEMPLATE.md` gives
the sections (What / Why / How to test / Evidence / Risks / Checklist); `yarn wt publish
--body-file .wt/pr.md --attach .wt/evidence/<file>` sends a body you wrote with its proof.

Merge only on green. Required approvals and automated review are the repo's own policy to
add.

## What CI does, and when

| Trigger | Workflow | What runs |
| --- | --- | --- |
| PR opened against `__TRUNK__` | `.github/workflows/ci.yaml` | install → generate → typecheck → lint → guards → contract → unit → e2e validate → e2e lanes |
| PR **merged** into `__TRUNK__` | same workflow, push job | the image build and the deploy slot (`deploy/config.yaml`) |

The gates run **after** the PR is opened. Merge only once they are green.

Because the image build happens only after merge, a misplaced dependency passes CI and then
breaks the build. **A new dependency goes in the `package.json` of the workspace that uses
it** — check before you merge.

## Hotfixes

A hotfix is a fix that must reach production before the next release.

1. Cut `fix/TICKET-name` from the **latest `releases/vX` branch**
   (`yarn wt create fix/ABC-1-name --from releases/vX`).
2. Open a PR into `__TRUNK__` (`wt publish` targets it automatically and reminds you of
   step 3); attach validation evidence.
3. Open a second PR from the same branch into `releases/vX`.
4. The release owner deploys to production.

## Branch lifetime

**Keep the branch until the work is deployed to production.** Do not delete it after the merge
into `__TRUNK__`. The branch is what a rollback or a re-deploy is cut from while the change is
still moving through staging. This applies to whatever merges into `__TRUNK__` — an epic
branch or a standalone feature branch. `wt dispose` removes the worktree directory and keeps
the branch for exactly this reason.

Never delete a `releases/vX` branch.

## Epics, worktrees, and sub-branches

Each epic usually gets one epic branch, cut from `__TRUNK__`. Under it, multiple worktrees and
sub-branches cut from the epic branch are normal and encouraged: split the epic's work, open a
PR from each sub-branch into the epic branch, and merge as it's ready. The epic branch merges
`__TRUNK__` in to stay current; sub-branches merge the epic branch in.

Sub-branches are exempt from the branch-lifetime rule above: once a sub-branch is merged into
its epic branch, delete it. The keep-until-production rule applies to what merges into
`__TRUNK__`, not to every intermediate branch along the way.

A sub-branch that also reached `__TRUNK__` on its own PR is still deletable once the epic
carries its commits — locally and on the remote. Confirm containment first
(`git merge-base --is-ancestor origin/<sub-branch> origin/<epic>`).

### Worktrees

The primary checkout stays on `__TRUNK__` and is not worked in: it is the base worktrees are
cut from and the source of the `.env` files. Every change is a worktree. An epic is a worktree
whose branch is the base for its sub-worktrees. `yarn wt` covers the lifecycle — create,
provision, run, health, stop, status, logs, publish, dispose — and `wt run` is the only way to
start an app: each worktree gets a slot that determines every port it uses, so several
worktrees run the full stack at once without colliding. Full reference — slots, the port
table, the `--db` rule for schema changes, evidence, troubleshooting — is in
[worktrees.md](worktrees.md).

## Hard rules

- Cut every branch from `__TRUNK__` (or from an epic branch cut from it). Never from `main`.
- Open a PR into `__TRUNK__` only when the feature is complete and validated by its developer.
- Never delete a feature branch before its change is in production.
- Never merge a PR with red checks.
- Never mix unrelated features into one PR.
- New dependencies go in the `package.json` of the workspace that uses them.
