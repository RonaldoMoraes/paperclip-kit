# Checks

Every gate is a root `package.json` script, so what CI runs is what `yarn <gate>` runs on
a laptop. Each diagnostic says what to fix; this page holds what a diagnostic cannot.

| Gate | Script | Proves |
| --- | --- | --- |
| `yarn typecheck` | server build tsconfig + every `typecheck:*` a surface adds | The tree compiles |
| `yarn lint` | `biome check .` | Format, imports, built-in rules, and every `biome/*.grit` |
| `yarn lint:guards` | `scripts/check-lint-guards.mjs` | Every grit is wired **and fires** on its canary |
| `yarn test:contract` | `scripts/check-test-contract.mjs` | The testing contract (below); also runs at write time |
| `yarn test` | `vitest run` + `test:mobile` when present | Unit specs |
| `yarn test:e2e:validate` | `tests/script/validate-*.mjs` (web surface) | No raw locator in a smoke/regression spec, catalogs well-formed |
| `yarn test:e2e` | Playwright, hermetic (web surface) | Every screen state, against the contract mocks |

## `yarn lint` — Biome plus the plugins

Each `.grit` in [`biome/`](../biome) owns one concern and states its scope in its header;
[`biome.json`](../biome.json) registers them. What is not obvious from a diagnostic:

- Suppress one line with `// biome-ignore lint/plugin: <reason>`, or
  `// biome-ignore lint/plugin/<grit file name>: <reason>` for one rule. A bare `plugin:`
  suppresses nothing, and a name no file carries reports `suppressions/unused`. The reason
  is the claim the line makes and why no rule-abiding form exists. A `!` path in an
  override disables a plugin for a whole file — for files the rules do not apply to, never
  for one awkward line.
- **The `apps/server/**` override is last and stays there.** Biome takes
  `javascript.parser` from the last override a file matches, and the spec override
  matches `apps/**/*.spec.ts`, so any higher and a server spec with a parameter decorator
  fails to parse. Plugin and rule settings do merge; only the parser depends on this
  order. The kit scaffold inserts a module's overrides *before* the server one for this
  reason — never append after it by hand.
- A warn-level rule gates nothing: its job is to put the question in front of whoever
  wrote the line, who deletes the code or names the reason in a suppression.
- `.grit` patterns match Biome CST nodes (`JsModuleSource`, `JsImport`), not snippets:
  `import $x from $src` matches only single-specifier clauses, and `<: r"…"` regexes are
  full-match, so a module regex needs a `/.*` tail to catch subpath imports. The
  guardrails skill (`.agents/skills/guardrails/`) has the authoring procedure.

Base ships five plugins: `promise-chains` (everywhere), `spec-guardrails` and
`no-flaky-mocks` (specs), `no-unknown-cast` (everywhere), `error-shape` (features,
mobile routes, `shared/{contracts,domain}` — warn). Surfaces and modules add theirs.

## `yarn lint:guards` — the canary

[`scripts/check-lint-guards.mjs`](../scripts/check-lint-guards.mjs): each plugin has a
deliberately violating fixture in [`scripts/lint-canary/`](../scripts/lint-canary),
listed in `canaries.json` with the path it is copied to (inside the plugin's override
scope) and the diagnostic fragments that must appear. The run fails unless every
`biome/*.grit` is wired, every wired plugin has a canary, and every canary fires. Run it
after any guard change or Biome upgrade. A dead guard fails open with zero diagnostics —
that is the failure this gate exists to catch.

## `yarn test:contract` — the testing contract

[`scripts/check-test-contract.mjs`](../scripts/check-test-contract.mjs), also run by the
write-time guard on every `.ts`/`.tsx` edit: every screen has a sibling `*.spec.tsx`,
every routed web screen has `tests/specs/web/contract/<journey>/<kebab-name>.spec.ts`,
every controller and service has a sibling spec, no copy-coupled locator in the Playwright
suite or element catalogs, and `apps/web/src/testing/seeds.ts` holds only `import type`
(a runtime import drags the app into the Playwright process). A surface that is absent is
not checked. Exemptions with a reason go in
[`scripts/test-contract.allow.json`](../scripts/test-contract.allow.json) — an entry whose
file no longer exists fails the gate, so debt cannot outlive its reason.

## What a spec must not assert

Two rules no gate can check, because both failures stay green in the tree they
were written in and break in the next one:

- **No real `KIT_*` in a spec.** `KIT_PORTS`, `KIT_MODULES` and `KIT_HANDLERS` hold
  whatever the manifest generated, and a port a module provides may inject a token only
  `AppModule` makes global — `payments-stripe`'s auth-extensions port takes `PRISMA` from
  the `@Global()` `DatabaseModule`. A testing module compiled from the real lists
  therefore fails to resolve on any tree that selected such a module. Build the module
  under test from the spec's own fixtures instead:
  [`ports.module.spec.ts`](../apps/server/src/common/ports/ports.module.spec.ts) and
  [`request-pipeline.integration.spec.ts`](../apps/server/src/common/request-pipeline.integration.spec.ts)
  both do. Reading a generated list without instantiating it — pinning `PortsModule`'s
  exports metadata to `KIT_PORTS` — is the one safe use.
- **No absolute count of anything a module contributes.** Settings action rows, ports,
  msw handlers, server modules: `toHaveLength(3)` or a whole-array `toEqual([…])` over one
  of those passes today and fails the moment a module adds an entry. Assert that the entry
  this spec is about is present (`arrayContaining`, a `find`) and let the length be
  whatever the manifest made it. A list base owns and closes — `API_ERROR_CODES` — is not
  one of these, and its spec pins it exactly.

## The write-time guards

[`.claude/hooks/guard.sh`](../.claude/hooks/guard.sh) runs after every edit
(`PostToolUse` in [`.claude/settings.json`](../.claude/settings.json)): it refuses any
edit to a generated file (`routeTree.gen.ts`, every `*.gen.ts`/`*.gen.tsx`,
`db/generated/`) and runs the testing contract on `.ts`/`.tsx` edits. Contract: silent
and exit 0 on pass; exit 2 with the diagnostic on stderr when the agent must act. An
advisory hook always exits 0 and speaks through `hookSpecificOutput.additionalContext`.
Rules that need a diff against `HEAD` — "only what this edit adds" — use
[`.claude/hooks/lib/added.sh`](../.claude/hooks/lib/added.sh); see
[`linting.md`](linting.md) for when a rule belongs there.

## `yarn test:e2e` — hermetic Playwright

Every `/api` request is answered by the contract handlers (`shared/contracts/mocks.ts`),
the same list the apps run in mock mode. An unanswered request, a throwing resolver or a
page error fails the test — the suite fails closed. `API_MODE=live` skips the routing —
local only, never CI. Three projects, one folder each under `tests/specs/web/`:
**contract** (one spec per screen, one test per screen state — the testing contract
demands it), **smoke** (the critical path, fast), **regression** (everything else).
`yarn test:e2e:validate` bans raw locators in smoke and regression specs; QA's gate table
is [`../tests/docs/quality-gates.md`](../tests/docs/quality-gates.md).

## The testid convention

E2E locates through POM keys from the element catalogs (`tests/elements/*.yaml`) that
resolve to `data-testid`, named `<screen>-<element>`; the same names are `testID` on
mobile. A screen declares its identity with `useScreenTag("<kebab-name>")`, which e2e
asserts instead of copy, and assertions prefer real data (an email, a count) over
surrounding copy, because i18n translates every string. Unit specs find elements by the
same testids and may assert default-locale copy, since they render the source language.
