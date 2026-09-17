# Paperclip Kit

Turns any directory into an AI-ready product company for Claude Code — and, after one interview,
into a working product tree with the guardrails already up. Three layers, one install:

| layer | where | what |
|---|---|---|
| **Company** | `template/` | The AI company you direct as Founder: `CLAUDE.local.md` (the on/off toggle), `.paperclip/{PLAYBOOK,STATUS,STORY,decisions}.md`, the **work ledger** (`.paperclip/bin/pc` over `campaigns/`, `work/`, `findings/`, `contracts/`, `research/`, `log/`) so nothing in flight lives only in a transcript — it refuses two tasks over one path and refuses to close a campaign with open work — the brief blocks in `.paperclip/briefs/`, the role personas (CEO, CTO, CRGO, CMO, Engineer, Researcher, UI/UX), and the commands `/paperclip /role /hire /where /decide /brief` plus the work ones `/campaign /task /findings /handoff`. Local-only in a work repo. |
| **Engineering** | `engineering/` | Project-agnostic intelligence: personas (platform, design-systems, mobile engineers, the Playwright trio), commands (`/grill /scaffold /feature /module`, worktrees, Playwright), skills (guardrails, worktrees, mobile, web-verify, lib, auth, Playwright). One source of truth wherever it lands: the files go to `.agents/{agents,commands,skills}` and `.claude/` links into them, one symlink per entry — `install.sh` and the scaffold write the same layout. |
| **Skeleton** | `skeleton/` + `bin/` | The boilerplate a production web/server/mobile product was distilled into: `base/` (NestJS server, shared contracts/domain/ui, guards, CI, docs, `AGENTS.md`), `surfaces/{web,mobile}/`, `modules/<id>/`, `versions.json` (every pin, once). `bin/scaffold.sh` assembles them from a manifest. |

Patterns are ported; product code is not. The generated product has one golden-path feature
(`example`) in every layer, and `/feature` clones it.

## Prerequisites

- **Node 22.17.1** — a machine default of 20 is common. `volta` reads the generated `package.json` pin
  by itself; with nvm, `nvm use 22.17.1` inside the product. The scaffold engine runs on 20 with a
  warning; `yarn install` and the gates need 22.
- **Yarn 4** through corepack: `corepack enable` (the product pins `yarn@4.18.0`).
- **Docker** — only for the `db-prisma` module (`docker-compose.db.yml`, Postgres 16).
- **Chromium** for the e2e gate: `yarn --cwd tests playwright:install`, once per machine.
- `bash` for `install.sh`. The kit itself has zero npm dependencies.

## Install

```bash
~/paperclip-kit/install.sh /path/to/repo      # into an existing repo (or run it from inside)
~/paperclip-kit/install.sh --new ~/code/acme  # create the directory, then install
```

Nothing is ever clobbered. The company layer lands as real files (`CLAUDE.local.md`, `.paperclip/`,
its own `.claude/{agents,commands}/*.md`); the engineering layer lands in `.agents/{agents,commands,skills}`
with one relative symlink per entry in `.claude/` beside them — different file names, so `/paperclip`
and `/grill` sit in the same directory, one a file and one a link. Edit only under `.agents/`.
In a repo with `.git`, every installed path (link included) goes to `.git/info/exclude` (local-only),
so the work repo stays pristine. `.paperclip/kit.json` records where the kit lives; re-running the
installer adds what is missing and touches nothing else.

## The flow

1. **`paperclip on`** — the company wakes up (off by default each session).
2. **`/grill`** — an interview, not a form: fourteen areas (product, surfaces, repo shape, data, auth,
   payments, LLM, notifications, analytics, hosting, compliance, team/tickets, naming, working style)
   plus each selected module's own questions. Small batches, defaults with their cost, one confirmed
   line per answer. Writes `.paperclip/project.manifest.json`
   ([schema](docs/manifest.schema.json), [example](docs/manifest.example.json)).
3. **`/scaffold`** — runs `bin/scaffold.sh --manifest .paperclip/project.manifest.json --out .`:
   base → surfaces → modules in dependency order (surface and module `requires` checked, placeholders
   substituted), the gen files (`KIT_MODULES`, `KIT_PORTS`, `KIT_HANDLERS`, `KIT_GATES`…), the merged
   files (`package.json`, `.env.example`, `biome.json`, `AGENTS.md`…), the engineering layer. Then Claude
   finishes what a script cannot — `HUSKY=0 yarn install`, `yarn routes:generate` (web),
   `yarn db:generate` (db-prisma), the modules' post-scaffold notes — and runs the gates
   `typecheck · lint · lint:guards · test · test:contract · test:e2e:validate · test:e2e`, reporting
   each honestly. Same manifest, same tree. `--update` re-applies a changed manifest without touching
   product edits.
4. **`/feature <name>`** — clones `example` across contract, server, web, mobile and e2e for the first
   real feature. **`/module <id>`** adds a module later.

Day to day: `/where` for the control panel reconciled against the ledger, `/task` to open or list work,
`/campaign` when the work needs more than one agent, `/findings` to triage what they raised, `/handoff` to
end a session so the next one starts cold and complete, `/decide` for the log, `/brief` for deep context,
`/role cto` (or "CTO mode") to switch lens, `/hire` to add a role.

The ledger CLI behind those commands is **`.paperclip/bin/pc`** — always callable by that path, from any
subdirectory; `export PATH="$PWD/.paperclip/bin:$PATH"` if you would rather type `pc`. `pc campaign new`
opens a fan-out and `pc campaign close` refuses to end one while a task is unfinished or a finding it
raised is open; `pc task new` refuses a `--scope` glob that overlaps a live task (`pc scope check` asks the
same question first, `--force` accepts an overlap and records it on both tasks); `pc estimate` reports the
median duration — and the median tokens, where the rows carry them — per task class; `pc handoff` writes a
brief a cold session can resume from, `--campaign <id>` for one fan-out alone.

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
├── VERSION                 0.2.0
├── bin/scaffold.sh         → bin/lib/scaffold.mjs (the engine) + scaffold.test.mjs
├── template/               layer 1
├── engineering/            layer 2: agents/ commands/ skills/
├── skeleton/               layer 3: versions.json base/ surfaces/{web,mobile}/ modules/<id>/
└── docs/                   ARCHITECTURE.md (the contract) · MODULES.md (authoring guide)
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
- **Grow the company layer**: edit `template/`, re-run `install.sh` anywhere — existing files stay.
- **Ship a kit change to a product**: bump `VERSION`, then `/scaffold` (update mode) in the product;
  untouched kit files are refreshed, gen files regenerated, product edits reported and left alone.

The kit should live in its own git repository, versioned across machines and products; it does not
initialise one for you — `git init` here when you are ready.
