# __PRODUCT_NAME__ docs

What the code cannot say about this product: the decisions and why, the product
vocabulary, and a map to where each thing lives. The rules that hold on every edit are in
[`../AGENTS.md`](../AGENTS.md); how a module works is in the module. Present tense; a page
that stops matching the code is fixed or deleted. QA's e2e docs are in
[`../tests/docs/`](../tests/docs/).

- [Architecture](architecture.md) — why the product is standalone, why an endpoint exists
  once, auth and the data plane.
- [Glossary](glossary.md) — product vocabulary, each term linked to the module that names it.
- [apps/web](web.md), [apps/mobile](mobile.md), [apps/server](server.md),
  [shared/ui](ui.md) — the decisions behind each app and where its pieces are.
- [Checks](checks.md) — what the gates enforce and the Biome mechanics that are not
  obvious from a diagnostic. [Linting](linting.md) — the three enforcement tiers and
  where a new rule belongs.
- [Worktrees](worktrees.md) — one worktree per change, port slots, `yarn wt`.
  [Branching](branching.md) — trunk, branch names, PRs, releases.
<!-- kit:modules -->

## Where else things live

Not everything is in this tree, and that is deliberate:

| Kind | Home |
| --- | --- |
| Always-on rules | [`AGENTS.md`](../AGENTS.md) |
| A procedure an agent runs on demand | `.agents/skills/<skill>/` |
| Plans, designs, open decisions, backlogs | `.spec/<domain>/` — deleted when the work ships |
| Architecture and reference prose | here |

**This tree is present tense.** If a document says *should*, *will*, or *TBD*, it belongs
in `.spec/`, not here. If it says *does*, it belongs here.

A skill is a **procedure**; a doc is **reference**. "How the X system is built" belongs
here; "how to do X" belongs in a skill. Before adding a doc, ask whether the code could
say it instead.
