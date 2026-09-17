---
name: /playwright-test-heal
id: playwright-test-heal
category: E2E / Playwright Test Agents
description: Run the Playwright Healer to debug and fix a failing spec locally (Healer is OFF in CI)
---

# Playwright Test Healer

Use the `playwright-test` MCP server to debug and fix a failing spec under
`tests/specs/web/`. **Healer is local-only — never wired into CI.**

## Read first

- `.agents/skills/playwright-agents/SKILL.md` — where things live, the rules, healer policy.

## Prerequisites

1. The web app up in mock mode (`yarn dev:mock`).
2. The `playwright-test` MCP server configured (`.mcp.json`, `cwd: tests`).

## Input

Argument: the failing spec path (relative to `tests/`) or a `--grep` pattern. If omitted, ask.

## Steps

1. **Initial run** — `test_run` scoped to the target to confirm the failure.
2. **Debug** — `test_debug` for each failing test.
3. **Investigate** when paused: `browser_console_messages`, `browser_evaluate`,
   `browser_generate_locator`, `browser_network_request(s)`, `browser_snapshot`.
4. **Root cause** — one of:
   - selector drift (a testid renamed, a locator now ambiguous);
   - timing (a missing wait on a screen tag, a premature assertion);
   - mock gap (a contract mock the journey now needs — the fixture fails closed);
   - app regression — **raise it; do not mask it**.
5. **Fix at the right layer**:
   - selector / wait → the screen's catalog (`tests/elements/`) and POM (`tests/pages/web/`), not the spec;
   - mock gap → the handler beside its contract in `shared/contracts/<feature>/`;
   - test logic → the spec, preserving its describe/tag structure;
   - dynamic data → a regex locator inside the POM.
6. **Re-run** with `test_run` after every fix until green.
7. **Last resort** — the test is right and the app is wrong: `test.fixme()` with a
   comment naming what happens instead of the expected behaviour. Never `fixme` a green test.

## Guardrails

- Never wait for `networkidle`.
- Never write a raw locator in a spec while fixing — through the POM, always.
- Healer stays out of CI — do not add it to `.github/workflows/ci.yaml`.
- Do not commit — leave the fix for review.

## Output

- Files changed (catalog / POM / mock / spec).
- Final `test_run` result.
- One-line root cause per fix.
