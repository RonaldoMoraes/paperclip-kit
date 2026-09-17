---
name: /playwright-test-generate
id: playwright-test-generate
category: E2E / Playwright Test Agents
description: Run the Playwright Generator against an existing plan and emit a POM-only spec under tests/specs/web/
---

# Playwright Test Generator

Use the `playwright-test` MCP server to materialise a Playwright `.spec.ts` from an
existing `.plan.md`. The spec joins the hand-written suite under `tests/specs/web/`.

## Read first

- `.agents/skills/playwright-agents/SKILL.md` — where things live, the rules, healer policy.
- `tests/docs/` — quality gates, suites, element catalogs.

## Prerequisites

1. The web app up in mock mode (`yarn dev:mock`).
2. The `playwright-test` MCP server configured (`.mcp.json`, `cwd: tests`).
3. A plan saved by the Planner under `tests/agents/plans/<suite>/<journey>/<name>.plan.md`.

## Input

Argument: the plan path (relative to `tests/`) or the bare plan name. If omitted, ask
which plan under `tests/agents/plans/` to generate.

## Steps

1. **Resolve the spec target**: plan `tests/agents/plans/<suite>/<journey>/<name>.plan.md`
   → spec `tests/specs/web/<suite>/<journey>/<name>.spec.ts`. Same `<suite>/<journey>/<name>`.
2. **Read the plan**: the mock state it assumes, each scenario (title, steps,
   expectations), the screen tags and testids it names.
3. **Per scenario**: `generator_setup_page`, replay each step with `browser_*` tools
   using the step text as the intent, verify with `browser_verify_*`, then
   `generator_read_log`.
4. **Create or extend**: if the target spec does not exist, `generator_write_test` at the
   target path, importing `test`/`expect` from `../../../fixtures/web` and the screen's
   page object from `tests/pages/web/`. If it exists, append the new `test(...)` blocks
   at the **end** — never move existing tests.
5. **Rules the emitted code satisfies**:
   - POM only — no `getByTestId` / `getByText` / `getByRole` / `page.locator` in the spec.
     A locator the POM lacks is added to the screen's catalog and POM, not inlined.
   - Assertions on the screen tag, testid visibility, or real data — never on copy.
   - Every `/api` the journey touches is answered by a contract mock; a missing handler is
     added beside its contract, never stubbed in the spec.
   - One test per screen state in the `contract` suite; a comment with the step text
     before each step; test title = scenario name; describe = the plan's top-level item.
   - Never wait for `networkidle`.
6. **Verify**: `yarn --cwd tests playwright test --list <relative-path>` parses;
   `yarn test:e2e:validate` and `yarn test:contract` pass.
7. **Output**: the spec path created/extended and the run command
   (`yarn --cwd tests playwright test specs/web/<suite>/<journey>/<name>.spec.ts`). Do not commit.

## Guardrails

- Never write specs under `tests/agents/` — generated tests join `tests/specs/web/`.
- Never duplicate an existing scenario; if it exists, stop and say so.
- Extend existing page objects under `tests/pages/web/`; do not introduce helpers inline.
