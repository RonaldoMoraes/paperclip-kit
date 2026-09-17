---
name: /playwright-test-plan
id: playwright-test-plan
category: E2E / Playwright Test Agents
description: Run the Playwright Planner against a journey and save a plan markdown under tests/agents/plans/
---

# Playwright Test Planner

Use the `playwright-test` MCP server to explore a journey and save a structured test plan
under `tests/agents/plans/<suite>/<journey>/<name>.plan.md`.

## Read first

- `.agents/skills/playwright-agents/SKILL.md` — where things live, the rules, healer policy.
- `tests/docs/` — quality gates, suites, element catalogs.

## Prerequisites

1. The web app up in mock mode: `yarn dev:mock` (on the worktree's port — `yarn wt status`).
2. The `playwright-test` MCP server configured in `.mcp.json` with `cwd: tests`.

## Input

Argument after `/playwright-test-plan`: a short description of the journey, e.g.
`example list toggle done` or `settings sign out`. If none, ask (open-ended) which
journey / suite to plan.

## Steps

1. **Determine `<suite>` and `<journey>`.** `<suite>` ∈ `contract` (one spec per screen,
   one test per state), `smoke` (critical path), `regression` (everything else).
   `<journey>` is the feature or user story the screens belong to (`example`, `settings`,
   `onboarding`).
2. **Determine the starting state** from the contract mocks: which fixture or ledger
   state the journey needs (`shared/contracts/<feature>/mock-*.ts`), and whether the
   session fixture applies (auth module).
3. **Compute the plan path**: `tests/agents/plans/<suite>/<journey>/<name>.plan.md`. It
   must mirror the eventual spec `tests/specs/web/<suite>/<journey>/<name>.spec.ts`
   exactly.
4. **Explore via MCP** — `planner_setup_page` once, then `browser_*` tools to walk the
   journey; read snapshots, not screenshots. Note every `data-testid` and the screen tag
   (`data-screen`) of each screen.
5. **Design scenarios**: happy path, edge cases / boundaries, error handling and
   validation, negative tests, one keyboard-only variant for the critical path, a
   `page.reload()` check for any state that must persist.
6. **Save the plan** with `planner_save_plan` at the path from step 3. It includes: title
   and context; the mock state it assumes; the target spec path; numbered scenarios with
   steps and expected outcomes, each outcome expressed as a screen tag / testid / data
   assertion (never copy).
7. **Output**: the saved path and a one-line summary per scenario. Do not generate the
   spec; that is `/playwright-test-generate`.

## Guardrails

- Plans live only under `tests/agents/plans/…` (gitignored — leave it for review, do not commit).
- Treat fresh mock state as the starting point for every scenario.
- Never plan an assertion on copy.
