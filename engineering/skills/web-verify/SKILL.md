---
name: web-verify
description: Verifying or debugging a web (`apps/web`) change in a running browser — the dev server's hot reload lying about a layout/CSS/stacking fix, white-page traps after a build, or confirming a route actually rendered instead of trusting a 2xx. Use whenever you need to check a web UI change live rather than just from the code.
---

# Web browser verification

The dev server's hot reload is unreliable for layout, CSS, and stacking/portal work, and
a stale `dist` bundle can serve a white page while `curl` still reports 200. Don't judge a
visual fix by how the page happens to look — follow the procedure:

[references/browser-verification.md](references/browser-verification.md)

Run the app in **mock mode** for this (`yarn dev:mock` — every `/api` answered by the
contract mocks, nothing else up), on the worktree's own port (`yarn wt status` says which;
never assume `5173`). Drive the browser through the `playwright-test` MCP tools
(`browser_navigate`, `browser_snapshot`, `browser_console_messages`, `browser_evaluate`) —
a snapshot is the evidence, a screenshot only when the developer asked for one. The
standing web rules live in `AGENTS.md` and `docs/web.md`.
