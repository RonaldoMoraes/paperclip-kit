# Copy diff

`yarn copy:diff` is the source-of-truth gate for the product's words. It evaluates
`@domain/copy` ([`shared/domain/copy.ts`](../shared/domain/copy.ts)) and a reference copy
module, flattens both into `SECTION.path.to.key → string`, and fails on every key where
the two disagree that the allowlist does not name. The reference is whatever owns the
copy — a design tool's export, a base locale, a prototype's copy file. Keys are the
contract: the app keeps the reference's export names and key paths, so one diff holds the
two side by side and a wording change upstream surfaces as a failing build, not a stale
screen.

## Files

| File | Holds |
| --- | --- |
| [`scripts/copy-diff.ts`](../scripts/copy-diff.ts) | The driver: resolves the reference, evaluates both sides under tsx, prints the report, sets the exit code |
| [`scripts/copy-diff.core.ts`](../scripts/copy-diff.core.ts) | The pure half — `flattenCopy`, `diffCopy`, `partitionDiff`, `AllowRule` — pinned by `copy-diff.core.spec.ts`, which runs in the server vitest project (`scripts/**`) |
| [`scripts/copy-diff.allowlist.ts`](../scripts/copy-diff.allowlist.ts) | `ALLOW_RULES: AllowRule[]` — every key the two sides may disagree on, each with its reason |
| [`scripts/copy-diff.tsconfig.json`](../scripts/copy-diff.tsconfig.json) | What `typecheck:copy-diff` compiles; `yarn typecheck` picks it up through `typecheck:*` |
| [`reference/copy.example.ts`](../reference/copy.example.ts) | A reference module in the expected shape; it mirrors the base barrel, so a first run against it is green. Deleted once the real reference is configured |

## Configuration

Two variables, read by `scripts/copy-diff.ts` from the environment or `.env` (a set
variable wins over the file):

| Variable | Meaning |
| --- | --- |
| `COPY_DIFF_PATH` | The reference module. On disk: relative to the product root. With `COPY_DIFF_REF`: relative to the git repository root, as `git show` reads it |
| `COPY_DIFF_REF` | Optional git ref — a branch (`origin/design-export`), a tag, a SHA. Set → the reference is `git show <ref>:<path>`, evaluated from a temp file, so a run needs no second checkout |

Unset `COPY_DIFF_PATH` → the run prints `no reference configured` and exits 0, so the gate
ships before the reference does. `COPY_DIFF_REF` without `COPY_DIFF_PATH` is an error.

A reference module is a TypeScript (or JavaScript) file whose named exports are the copy
sections: nested objects of strings, lists allowed (`SECTION.list.0.label`). Functions,
booleans and `null` are skipped on both sides — the app barrel's `fill` never shows up. A
reference read through git is evaluated alone, so it cannot import its siblings; one that
does is pointed at on disk.

## The run

```
copy:diff — @domain/copy vs origin/design-export:copy/en.ts
compared 27 app keys against 29 reference keys

ALLOWLISTED DIVERGENCES — ruled or pending, see scripts/copy-diff.allowlist.ts (1):
  SHELL_COPY.error.retry — hold — wording under review, decision 004
    app  "Try again"
    ref  "Retry"

allowlisted as not-yet-adopted or app-only: 2 keys (the allowlist is the progress meter)

MISSING IN APP (1):
  SETTINGS_COPY.about.licenses: "Open-source licenses"

FAIL — 1 diff(s) outside the allowlist.
```

Three buckets: **changed** (both sides have the key, the strings differ), **missing in
app** (the reference has it, `@domain/copy` does not — not adopted yet), **extra in app**
(`@domain/copy` has it, the reference does not — app-only or renamed). Allowlisted
entries print on every run; absorbing a diff never hides it. `yarn copy:diff --json`
prints the same report as one object (`reference`, `keys`, `allowed`, `blocking`, `ok`)
for a script or a PR comment. Exit codes: 0 clean or no reference configured; 1 blocking
diffs or a run that could not read a side.

## The allowlist

An `AllowRule` is `{ prefix, reason }`; it matches the key itself and everything under it
(`SECTION` or `SECTION.…`, never part of a segment). Rules are as narrow as the case
allows — a broad prefix also swallows the next reference edit to that section, which is
what the gate exists to surface. The shapes that recur: a reference section the app has
not adopted yet; an app-only `*_APP_COPY` section (a failure state the design never drew,
a computed label); copy the app keeps as data or code rather than under the reference's
keys; a temporary hold on a ruled key while the adoption lands. Shrinking the file is the
adoption; the reason on each rule is the reviewable part of the diff.

## CI

Base CI is untouched; the gate is one step in `.github/workflows/ci.yaml`, after
`Unit tests`:

```yaml
      # The copy gate — @domain/copy against the reference (docs/copy-diff.md).
      - name: Copy diff
        run: yarn copy:diff
        env:
          COPY_DIFF_PATH: reference/copy.example.ts
```

A reference read from git needs the ref on the runner: `actions/checkout` is shallow, so
the checkout step takes `fetch-depth: 0`, or a `git fetch origin <branch>` line precedes
the step. The scripts are typechecked by `yarn typecheck` already, through
`typecheck:copy-diff`.

## Swapping the reference

Change `COPY_DIFF_PATH` (and `COPY_DIFF_REF`); nothing else knows where the reference
lives. A reference with different export names is a rename in `@domain/copy`, not a
translation layer — the keys are the contract.
