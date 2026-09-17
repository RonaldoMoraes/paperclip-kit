---
name: playwright-agents
description: Authoring and healing Playwright e2e specs under `tests/` with the planner / generator / healer trio and the `playwright-test` MCP server — planning a journey into a plan file, generating a POM-only spec from it, or debugging a failing spec locally. Use when adding e2e coverage for a screen state or fixing a red Playwright run.
---

# Playwright agents

Three subagents drive the `playwright-test` MCP server (`.mcp.json`, `cwd: tests`):

| Agent | Command | Does |
| --- | --- | --- |
| `playwright-test-planner` | `/playwright-test-plan <journey>` | Explores the running app through browser snapshots and saves a numbered plan |
| `playwright-test-generator` | `/playwright-test-generate <plan>` | Replays each step live, then writes one spec per scenario |
| `playwright-test-healer` | `/playwright-test-heal <spec>` | Runs, debugs, root-causes and fixes a failing spec — **local only, never in CI** |

## Where things live

```
tests/
├── specs/web/<suite>/<journey>/<name>.spec.ts   # suite ∈ contract | smoke | regression — one Playwright project each
├── agents/plans/<suite>/<journey>/<name>.plan.md # gitignored; mirrors the spec path exactly
├── pages/web/                                   # page object models — the only place a locator is written
├── elements/*.yaml                              # per-screen element catalogs (web: / mobile: strategies) the POMs resolve
├── fixtures/web.ts                              # hermetic /api routing from shared/contracts/mocks.ts — fails closed
└── docs/                                        # quality gates, suites, catalogs
```

**Plan path mirrors spec path.** `agents/plans/contract/example/example-list.plan.md` ↔
`specs/web/contract/example/example-list.spec.ts`. Same `<suite>/<journey>/<name>`.

## The rules the generated code must satisfy

- **POM only.** No `getByTestId` / `getByText` / `getByRole` / raw `page.locator` in a
  spec; a spec reads as the user's steps through page objects. New elements go in the
  screen's catalog (`elements/<screen>.yaml`, `data-testid` `<screen>-<element>`) and its
  POM — `yarn test:e2e:validate` and `yarn test:contract` fail the rest.
- **Hermetic.** Every `/api` call is answered from the contract mocks; state is seeded
  through the mock's fixture or ledger, never by hand. An unanswered request fails.
- **Locate by testid, assert by screen tag / testid / real data**, never by copy — i18n
  will translate every string.
- **Contract suite = one spec per screen, one test per screen state.** A journey's
  critical path keeps one keyboard-only variant; persisted state gets a `page.reload()`
  assertion. The testing contract (`scripts/check-test-contract.mjs`) checks the spec
  file exists for every routed screen.
- **Append-only** when extending an existing spec; never duplicate a scenario.
- **Never wait for `networkidle`.**

## Healer policy

The healer fixes at the right layer: a selector drift in the POM or catalog, a mock gap
beside the contract, test logic in the spec, an app regression **raised, not masked**.
`test.fixme()` with a comment only when the test is right and the app is wrong. It runs
against a local stack and is not wired into CI — a CI that heals itself is a CI that
hides regressions.

## Prerequisites

The web app running in mock mode on the worktree's port (`yarn dev:mock`; `yarn wt status`
for the port), and Playwright's chromium installed (`yarn --cwd tests playwright install
chromium`).
