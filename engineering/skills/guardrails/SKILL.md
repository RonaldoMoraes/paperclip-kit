---
name: guardrails
description: Adding or changing a mechanical rule — a Biome GritQL plugin, its canary fixture, a check script, or a write-time hook — so an architecture invariant is enforced by a machine instead of remembered. Use when a review keeps catching the same mistake, when AGENTS.md is about to gain a "never do X" line, or when a guard stopped firing after a Biome upgrade.
---

# Guardrails

A rule that matters is enforced mechanically and stated once in `AGENTS.md` — never
tribal knowledge. This skill is the procedure for turning "we don't do that here" into a
check that fails, plus the canary that proves the check is alive.

## The procedure

1. **Name the invariant in one sentence**, with its why. "`shared/ui` takes no runtime
   import from `~/` — a design system that imports the app cannot be rendered bare."
   If you cannot say what breaks when it is violated, it is a preference, not a rule.
2. **Pick the tier** — the narrowest that makes it true (`docs/linting.md`):
   - Biome already has a rule for it → `biome.json` `linter.rules`, done.
   - It is a pattern in one file (an import, a call, a shape) → a `.grit` plugin.
     [references/writing-a-grit.md](references/writing-a-grit.md)
   - It needs counting, cross-file facts, or "only what this edit adds" → the
     write-time guard. [references/hooks.md](references/hooks.md)
   - It is about file *presence* (a spec beside every screen) → a check script like
     `scripts/check-test-contract.mjs`, run in CI and by the hook.
   - A machine cannot decide it → a line in `AGENTS.md`, and only then.
3. **Write the grit** (or the check), scoped in `biome.json` to exactly the files the
   rule is true of — `plugins` for everywhere, an `overrides` entry with `includes` and
   `!` exclusions otherwise. Insert new overrides *before* the `apps/server/**` one.
4. **Write the fixture and the canary entry.** One deliberately violating file under
   `scripts/lint-canary/<rule>.fixture.ts(x)`, one entry in `canaries.json` whose `dest`
   sits inside the rule's scope and whose `expect` needles quote the diagnostic. Run
   `yarn lint:guards` — it must go from failing (unplugged) to green.
   [references/canary.md](references/canary.md)
5. **Run `yarn lint`** on the real tree. Zero new diagnostics means the tree already
   obeys; each hit is either a fix or a `// biome-ignore lint/plugin/<rule>: <reason>`
   whose reason is a claim, not an apology. A warn-level rule gates nothing — use it
   when the fix is a decision (a new error class) rather than a rewrite.
6. **State it in `AGENTS.md`** in one sentence naming the grit, so an agent that meets
   the diagnostic knows the rule stands. The mechanism is the enforcement; the sentence
   is the pointer.

## When a guard stops firing

`yarn lint:guards` red after a Biome upgrade means the pattern rotted, not the code.
Re-read the grit against the current GritQL behaviour (the pitfalls in
[writing-a-grit.md](references/writing-a-grit.md)); the fixture is the test case. Never
"fix" the canary by loosening the needle.

## In a module

A kit module ships its guards the same way: `files/biome/<rule>.grit`, its fixture under
`files/scripts/lint-canary/`, `biome.plugins` / `biome.overrides` and `canaries` in
`module.json`. The scaffold wires them; `yarn lint:guards` in the generated tree proves
them. A module whose guard has no canary is rejected by the gate.
