---
description: "Push the worktree's feature branch and open its pull request"
argument-hint: "[optional: target branch, defaults to the trunk]"
---

Push the current worktree's feature branch to origin and open the PR.

Run from **inside the worktree**:

```bash
yarn wt publish $ARGUMENTS
```

Flags: `--to <branch>` to override the target, `--draft` for a draft PR, `--yes` to skip
the confirmation prompt, `--body-file <md>` for a body you wrote along the template's
sections, `--attach <file>[#alt text]` (repeatable) for the evidence. `yarn wt publish
--help` prints the detail.

Before running:
- The feature is complete and validated by you in your own environment, behaviour and
  visuals against the design source of truth — merging into the trunk means "in the
  next release".
- The trunk (or the epic branch) is merged into the branch.
- Everything must be committed — the command refuses on a dirty tree.
- The branch must have commits ahead of the target, or the PR would be empty.

This will:
1. Print a summary — branch, target, title, the commits, and whether `origin/<target>` is
   an ancestor of HEAD (it warns with a count when you are behind)
2. Ask for Enter to confirm
3. `git push -u origin <branch>`
4. Open the PR with `gh pr create` (or print the compare URL if `gh` is missing).
   If a PR is already open, the push updates it and CI re-runs.

The title is derived from the branch name — `feat/ABC-1234-short-name` becomes
`feat(ABC-1234): short name`. Without `--body-file` the body is
`.github/PULL_REQUEST_TEMPLATE.md`, sent explicitly because GitHub only auto-applies that
template on the web form, not through the API — then fill in What / Why / How to test /
Evidence / Risks and tick the checklist on GitHub.

When you did the work, write the body yourself: put it in `.wt/pr.md` along the template's
sections, save the proof (screenshots, recordings) under `.wt/evidence/` — both gitignored —
reference each file from the Evidence section as `![what it shows](./.wt/evidence/name.png)`,
and publish with `--body-file .wt/pr.md --attach .wt/evidence/name.png` for each file.
`--attach` needs gh 2.99.0 or later and refuses otherwise, so evidence is never dropped
silently.

The target defaults to the base recorded when the worktree was created, so an epic
sub-worktree opens its PR into the epic branch and everything else into the trunk. An
epic becomes several feature PRs into the epic branch, then one epic PR into the trunk.

A hotfix cut from a `releases/*` branch targets the trunk too — publish reminds you to
open the second PR into the release branch once the first merges.

After it succeeds:
- CI runs now that the PR is open. **Merge only when it is green.**
- Check that any new dependency is in the `package.json` of the workspace that uses it.
  The Docker build runs *after* the merge, so a misplaced dependency passes CI and then
  breaks the deploy.
- **Keep the branch** until the change reaches production — do not delete it on merge.
- Stop the worktree's stack when you are done with it: `yarn wt stop`.

See `docs/worktrees.md` and `docs/branching.md`.
