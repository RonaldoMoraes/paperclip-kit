# Paperclip Kit

Turns any repo into an AI company you direct as Founder, then (after one interview) into a working product tree with the guardrails already up. It's built to *feel* like a company and *cost* like plain Claude Code: [Superpowers](https://github.com/obra/superpowers) is the engineering engine, [ai-memory](https://github.com/akitaonrails/ai-memory) is the memory, and the kit adds the company on top.

| layer | where | what |
|---|---|---|
| **Company** | `template/` | Role lenses (CEO, CTO, CRGO, CMO, UI/UX, plus any you hire), a control panel (`STATUS.md`, drawn in the terminal or as an HTML dashboard by `.paperclip/bin/panel`), a decision log, and seven commands: `/paperclip /role /where /build /decide /hire /handoff`. Local-only in a work repo. |
| **Engineering** | `engineering/` | Project-agnostic intelligence: personas, `/grill /scaffold /feature /module`, worktrees, Playwright, and skills (guardrails, mobile, web-verify, lib, auth). The files land in `.agents/`, with one symlink per entry in `.claude/`. |
| **Skeleton** | `skeleton/` + `bin/` | The boilerplate a production web/server/mobile product was distilled into. `bin/scaffold.sh` assembles it from a manifest. |

## Why it's built this way

1.0 is a rewrite, driven by a benchmark: the same feature built six ways ([`bench/RESULTS.md`](bench/RESULTS.md)). The 0.3 build harness took 197+ awake minutes and ≥ $57 without finishing, where plain Claude Code and Superpowers + ai-memory each finished in ~45 minutes for ~$18, with top scores from a blind judge. What made 0.3 slow was a relay of agents per feature, a 101 KB work order read ~70 times, and 153 hand-kept ledger calls. None of that was what made it feel like a company. So 1.0 keeps the feel and drops the machinery. The design is in [`docs/DESIGN-lite.md`](docs/DESIGN-lite.md).

## Install

```bash
~/paperclip-kit/install.sh /path/to/repo --with-superpowers   # the company + Superpowers for that repo
~/paperclip-kit/install.sh --new ~/code/acme                  # create the directory, then install
~/paperclip-kit/install.sh . --replace-company                # upgrading from 0.3 (old files move to a backup)
~/paperclip-kit/install.sh . --with-codex                     # the company in Codex too (once per machine)
```

- **Superpowers**: `--with-superpowers` runs `claude plugin install superpowers@claude-plugins-official --scope local`, so it's enabled for that repo only. Or install it yourself inside Claude Code.
- **Codex**: `--with-codex` adds a managed block to `~/.codex/AGENTS.md` (active only in repos with `.paperclip/`) and installs Superpowers for Codex. In Codex, "paperclip on" and the commands work the same; type them with or without the `/`.
- **ai-memory** (recommended, optional): install it once per machine ([quick start](https://github.com/akitaonrails/ai-memory#quick-start)), then, for each agent you use: `ai-memory install-hooks --agent claude-code --apply --project-strategy repo-root` and `ai-memory install-mcp --client claude-code --apply` (and the same with `codex`). `repo-root` makes a repo's worktrees share one memory. Without it, `/handoff` writes `.paperclip/HANDOFF.md` instead.
- **Nothing is ever clobbered.** In a repo with `.git`, every installed path goes to `.git/info/exclude`. `.paperclip/kit.json` records where the kit lives.
- **Prerequisites** for the product layer: Node 22.17.1, Yarn 4 via corepack, Docker (for `db-prisma`), and Chromium for the e2e gate.

## Using the company

```
paperclip on            → the CEO answers, with the control panel
CTO mode · /role cto    → switch lens; every answer opens with the lens name
/build <what>           → the CTO triages it and runs it through Superpowers
/where  ·  /where --html → the control panel, reconciled against plans and git, or as a dashboard
/decide <call>          → log a decision that's expensive to reverse
/hire <role>            → a new lens (or a parallel agent, when the work must run beside you)
/handoff                → STATUS updated + a handoff the next session starts from (any provider)
```

**How `/build` routes work** (`COMPANY.md` §3). One question: *can I state the exact change and how to prove it in ~10 lines, right now?* **Direct**: do it and verify. **Planned**: a short Superpowers plan, executed inline. **Full**: brainstorming → plan → inline execution → one final code review. **Parallel**: independent pieces, one writer per file. The defaults, each backed by the benchmark:
- **Inline execution first.** Subagents only for ~8+ truly independent tasks.
- **Proportionate plans.** What and why; code only where it's the subtle part.
- **The cheapest capable model** for mechanical subagent work.
- **The repo's ownership rules honored.**
- **Proof at the user's boundary.**

**The control panel** is `.paperclip/STATUS.md`: what's waiting on you, what's in flight (with its Superpowers plan's progress), what's live, done and next. `.paperclip/bin/panel` draws it, `--compact` for session start and end, `--html` for the dashboard, `--json` for scripts. It's updated at three moments only, because every write is a round trip.

## The product flow

1. **`/grill`**: an interview, not a form. It covers fourteen areas plus each selected module's questions, and writes `.paperclip/project.manifest.json` ([schema](docs/manifest.schema.json), [example](docs/manifest.example.json)).
2. **`/scaffold`**: runs `bin/scaffold.sh --manifest .paperclip/project.manifest.json --out .`, then installs and runs the gates `typecheck · lint · lint:guards · test · test:contract · test:e2e:validate · test:e2e`, reporting each honestly. `--update` re-applies a changed manifest without touching product edits.
3. **`/feature <name>`** clones the golden-path `example` feature across every layer. **`/module <id>`** adds a module later.

## The benchmark

[`bench/`](bench/README.md) runs one real task through several approaches, one at a time, under identical conditions. It reports awake time, tokens and cost per phase, the repo's gates, a 21-check hidden acceptance test, and a blind judge. Every run is isolated from your own Claude setup and kept awake with `caffeinate`. Add an approach in `bench/config.json` and run `bench/bench.sh <approach>`.

## What the generated product contains

Always: a NestJS 11 server (`apps/server`) with three ports (notification, analytics, telemetry) and
console defaults, `shared/{contracts,domain,ui}`, the guards (`biome/*.grit` + the canaries that prove
they fire), the testing contract, the worktree CLI (`yarn wt`), CI, Dockerfile, `docs/`, `AGENTS.md`.

| surface | adds |
|---|---|
| `web` | `apps/web` (React 19, Vite 6, TanStack Router/Query, Tailwind over `shared/ui`) and the hermetic Playwright workspace `tests/` |
| `mobile` (requires `web`) | `apps/mobile` (Expo 54, expo-router 6, NativeWind 4), EAS delivery, the Appium lane inside `tests/` |

| module | requires | one line |
|---|---|---|
| `db-prisma` | — | Postgres through Prisma 7: the `db` workspace, one pool per process, one import seam |
| `auth-better-auth` | `db-prisma` | email-code sign-in (Google/Apple optional), one session on both transports, `SessionGuard`, account screens |
| `llm` | — | one `LlmClient`/`AgentRunner` port over a registry with failover; openai/anthropic/google/xai adapters and a fake |
| `notifications` | — | the `notification` port for real: SendGrid, Twilio, Expo push behind `NOTIFICATION_MODE=fake\|real` |
| `analytics` | — | the `analytics` port for real: one PHI-safe event contract, a queue per app, `POST /api/analytics/events`, MongoDB or console |
| `observability-sentry` | — | the `telemetry` port for real: console always, Sentry once a DSN is set — server, web and phone |
| `telemetry` | — | a request id on every request, structured JSON logs, one OpenTelemetry span per request |
| `copy-diff` | — | `yarn copy:diff` holds `@domain/copy` byte-equal to a reference copy module |
| `payments-stripe` | `auth-better-auth` | subscriptions sold on the web through Stripe Checkout: access computed once on the server and carried on the session, a paid route layout, deduplicated webhooks; inert without `STRIPE_SECRET_KEY` |
| `payments-revenuecat` | `payments-stripe`, `mobile` | the same subscriptions sold on the phone by Apple and Google through RevenueCat: a store seam with a mock store, a header-authed webhook, a confirm the server answers by reading RevenueCat |

Every module must pass the gates alone on top of base and together with the others — the matrix is in
[`docs/MODULES.md`](docs/MODULES.md) §6, and what has actually been proven, with anything still red, is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8.

## What is inside

```
paperclip-kit/
├── install.sh              company layer + engineering layer (→ .agents/, linked from .claude/); never clobbers
├── VERSION                 1.0.0
├── UPGRADE.md              what a re-run of install.sh adds, and what an older install replaces by hand
├── bin/scaffold.sh         → bin/lib/scaffold.mjs (the engine) + scaffold.test.mjs
├── template/               layer 1: CLAUDE.local.md · .paperclip/{COMPANY.md, STATUS.md, decisions.md, roles/, bin/panel} · .claude/{agents,commands}
├── engineering/            layer 2: agents/ commands/ skills/
├── skeleton/               layer 3: versions.json base/ surfaces/{web,mobile}/ modules/<id>/
├── bench/                  the benchmark: TASK.md, run/evaluate/judge/report scripts, RESULTS.md
└── docs/                   ARCHITECTURE.md (the contract) · MODULES.md (authoring guide) · DESIGN-lite.md (why 1.0)
                            manifest.schema.json · manifest.example.json · module.schema.json
```

## Evolve it

- **Add a module**: `skeleton/modules/<id>/{module.json, files/, docs/<id>.md}` per
  [`docs/MODULES.md`](docs/MODULES.md). Never edit a base file from a module — use a gen slot, a merged
  fragment, a new file, or `requires`. Prove it alone and with every other module.
- **Bump a version**: change it once in `skeleton/versions.json`; every `"@versions"` in base, surfaces
  and modules follows. A package missing there fails the scaffold on purpose.
- **Change the engine**: `bin/lib/scaffold.mjs`; then `node --test bin/lib/*.test.mjs` (`npm test`),
  which builds a synthetic mini-kit in a temp dir and checks copy order, placeholders, every gen and
  merged file, `--update`, dependency errors and `--dry-run`.
- **Grow the company layer**: edit `template/`, re-run `install.sh` anywhere — existing files stay, so a
  change to a file an install already has goes in [`UPGRADE.md`](UPGRADE.md) as a replace-by-hand step.
- **Ship a kit change to a product**: bump `VERSION`, then `/scaffold` (update mode) in the product;
  untouched kit files are refreshed, gen files regenerated, product edits reported and left alone.

The kit should live in its own git repository, versioned across machines and products; it does not
initialise one for you — `git init` here when you are ready.
