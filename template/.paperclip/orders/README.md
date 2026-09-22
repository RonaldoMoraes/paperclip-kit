# orders/ — one work order per build

A work order is the plan of one Full-tier build (`/build`, `../HARNESS.md`): what a cold
executor on a cheaper model needs to carry the change out slice by slice without asking a
single question. `tech-lead` writes it, `critic` attacks it before anyone builds, and every
slice runs from it.

It is not a contract. A contract (`../contracts/`) is the agreed shape of a seam between
pieces of work built at the same time; an order is one change's plan, read in sequence. When
a build's slices share a seam with other live work, that seam still gets a real contract,
named in the order.

## File names

- `.paperclip/orders/<build>.md` — the order. `<build>` is `<yyyymmdd>-<slug>`.
- `.paperclip/orders/<build>.critique-<n>.md` — each critic reply, verbatim, with
  `tech-lead`'s answer to every objection appended (fixed in the order, or refuted with
  evidence). `n` counts passes: the first attack, then one per re-plan.
- Snapshots, when the build undoes by patch instead of local commits, go where the prompt
  says — `.paperclip/orders/<build>.snapshots/S<n>.patch` by default.

Not written by `pc`. Hand-written by `tech-lead` (PLAN mode) and the orchestrator.

## How the ledger points here

pc's `contract:` field means *the document this work builds against*, and for a build that
is the order:

```
pc campaign new "<build>: <title>" --contract .paperclip/orders/<build>.md \
  --goal "True when done: … · Not doing: … · Could break: …"
pc task new "<build> S1 — <name>" --class build-slice --role engineer --model <executor> \
  --scope <allowed path>… --gates <gate names> \
  --campaign <c-id> --contract .paperclip/orders/<build>.md
```

A slice's allowed paths are its task's `--scope`, so the ledger refuses two live slices
that would write one file. Gate names in `--gates` are the row names of the order's gate
table. `pc handoff` inlines the campaign's goal card and names the order's path; it does not
inline the order (it inlines `contracts/` only), so a cold session reads the order first.

## The template

```markdown
# Order <build> — <title>
Campaign: <c-id> · Tier: Full · Executor model: <policy default> (hard slices: name them and the model)
Where the code is written: <worktree path and branch | the primary checkout, by the Founder's go>

## Goal
True when done: …          Not doing: …          Could break: …

## Worktree prerequisites
What a FRESH checkout of the kind this build runs in needs before any gate can run (built
workspace libraries, generated clients…) and the exact command for each. A worktree tool
that installs dependencies does not necessarily build anything.

## What the executor must know
3–6 bullets. Link to the rule (the repo's agent instructions, a spec, a design source
file) — never paraphrase a rule from memory. Plus the **gate table**: per package, the
directory, the exact test command, the typecheck command, the lint command — **each proven
by running one existing spec with it INSIDE a fresh checkout** (a command proven in a
long-lived checkout passed there only because its libs were already built) — and the rule
for "clean": lint with the output cap lifted (e.g. Biome's `--max-diagnostics=500`; a
default cap of 20 hid a backlog in pilot 1), baseline taken before the first edit, compared
**by message** — no new message on an edited file, none at all on a new one. "0 tests" is a
failed gate.

| gate name | directory | command | expected |
|---|---|---|---|
| test:<pkg> | … | `…` | ≥ N passed |
| typecheck:<pkg> | … | `…` | exit 0 |
| lint:<pkg> | … | `…` | no new message vs baseline |

## Seams
Shared contracts the slices build against (`.paperclip/contracts/<name>.md`), or "none".

## Closed decisions
- <decision> — <why, one line>       ← the why is how the executor notices a broken premise

## Assumptions
- [PROVEN file:line | ran: <cmd> | research/<topic>.md] …
- [UNPROVEN → probe P1] …            ← none may remain when slices start

## Allowed paths                      Do not touch
- <path> — what changes              - <zone / file / dir> — why

## Slices (riskiest first; each ends green)
### S1 — <name>  (evidence: <what proves it>)
Allowed paths: <globs — become the slice task's --scope>
Steps: 1 … 2 …
Tests first: <the test that must fail before and pass after>
Gates: `<exact package-scoped test command>` → ≥ N passed · `<scoped typecheck>` → exit 0 · lint → clean
Stop if: …
Allowed without asking: <if X, do Y>

## Surfaces   (from the repo's surfaces checklist, if it has one)
applies: …        skipped because: …

## Out of scope / follow-ups
```

## Rules

- **Every path, symbol and command in an order exists today** — the planner checked, with
  `file:line`. An order written from memory is fiction.
- **A slice in flight is never amended.** A change lands before the slice starts or goes
  into the next one; the executor never sees an edit made while it works.
- **A re-plan rewrites only the affected slices** and gets a critic pass on the changed part
  (`critique-<n+1>.md`) before the slice that depends on it starts.
- **Proven assumptions graduate to `../research/`** with their evidence, so the next build
  reads them instead of proving them again.
- An order is kept after its build closes: it is the "why" of the code it produced, and the
  plan-gap findings of that build point at it.
