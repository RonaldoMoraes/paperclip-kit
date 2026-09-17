# Linting and write-time guards

> For maintainers. How rules are enforced in this repo, and where a new one belongs.

Three tiers. Put a rule in the narrowest one that makes it true.

| Tier | Where | Holds |
| --- | --- | --- |
| Biome built-ins | `biome.json` `linter.rules` | Formatting, import order, and what Biome already knows how to say |
| GritQL plugins | `biome/*.grit`, registered in `biome.json` (`plugins`, or an `overrides[].plugins` scope) | This product's architecture — its layering, its seams, its spec hygiene |
| Write-time | `.claude/hooks/guard.sh` (+ `lib/added.sh`) | What Biome can't express, and anything needing a diff against `HEAD` |

## Built-ins

Biome's recommended set (so `noExplicitAny` is already an error), plus `complexity/noVoid`
— `void somePromise()` is the idiom for silencing a floating-promise warning, so banning
it is what actually forces `await` or explicit handling — and `a11y` on.

## Plugins

Each `.grit` owns one concern. Its header states the constraint and why, and which
`biome.json` scope carries it; `biome.json` decides where it applies — package-wide in
`plugins`, or in an `overrides` entry whose `includes` names the directories and the `!`
exclusions. The base set: `promise-chains`, `spec-guardrails`, `no-flaky-mocks`,
`no-unknown-cast`, `error-shape`. A surface or module ships its own grits with its
fixtures, and the scaffold wires them before the server override.

Every plugin has a canary — a violating fixture in `scripts/lint-canary/` listed in
`canaries.json` — and `yarn lint:guards` fails when one is unplugged or silent. A grit
without a canary is not allowed to exist: the gate reports it.

## Write-time

Shell checks under `.claude/hooks/`, wired in `.claude/settings.json` as `PostToolUse`
hooks with `if: Edit(<glob>)` conditions. A diff-aware rule compares the file against
`git show HEAD:<path>` through `lib/added.sh`, so **only violations your edit introduces
block**: a legacy file with four occurrences passes; adding a fifth does not.

This tier exists for rules Biome cannot express. Counting occurrences is the clearest
example — GritQL has no way to say "more than one of these in a file". Refusing an edit
to a generated file is another: the rule is about the path, not the content.

Each guard's rules are listed in `AGENTS.md`. A guard rule that isn't listed, or a
listed rule that isn't enforced, is a bug.

## Two traps

**Overlapping `overrides` replace, they don't merge** — for rule *options*. Two overrides
that both configure `noRestrictedImports` and both match a file: only the last wins,
silently. Restate; never assume inheritance. `plugins` lists do accumulate across
matching overrides; `javascript.parser` comes from the last match, which is why the
`apps/server/**` override stays last.

**A whole-repo `biome check` on a tree with a backlog is not a signal.** Output caps at
20 diagnostics, so a new rule is real but invisible in a broad run. This product starts
at zero and stays there; if a backlog ever appears, lint the files you changed and let
the write-time guard make the rule bite per-edit.

## Adding a rule

1. Can Biome express it with a built-in rule? Use that, in the narrowest scope that is true.
2. Can GritQL express it as a pattern match? Add a `.grit` plugin, its fixture and its
   `canaries.json` entry — the guardrails skill has the procedure.
3. Does it need counting, or a comparison against the committed version? It belongs in
   the write-time guard, through `lib/added.sh`.
4. Can a machine not check it at all? Only then does it go in `AGENTS.md`.
