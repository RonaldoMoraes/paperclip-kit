# Paperclip Kit — Architecture

> The kit turns any directory into an **AI-ready product company**: the Paperclip company
> layer (roles, control panel, decisions), an **engineering layer** distilled from a
> production web/server/mobile product (guardrails, skills, agents, testing contract), and a
> **generator** that, after a grill session, emits a new product in that structure with the
> abstractions the founder opts into. Patterns are ported; product code is not.

## 1. Layout

```
paperclip-kit/
├── install.sh                  # company layer (real files) + engineering layer (→ .agents/, linked from .claude/) → a repo (existing or new); never clobbers
├── bin/
│   ├── scaffold.sh             # thin wrapper: node bin/lib/scaffold.mjs (warns below node 22, refuses below 20)
│   └── lib/scaffold.mjs        # manifest → product tree (base + surfaces + modules), gen files, merges; --update, --dry-run, --force-gen; scaffold.test.mjs beside it
├── template/                   # LAYER 1 — company (local-only in a work repo)
│   ├── CLAUDE.local.md         #   the on/off toggle and the Founder-facing rules
│   ├── .paperclip/             #   PLAYBOOK · STATUS (Control Panel) · STORY · decisions; the ledger: bin/pc over campaigns/ work/ findings/ contracts/ research/ log/; briefs/_blocks.md (the invariants, written once); HARNESS.md (the build harness: triage, the Full loop, Founder policy, the Claude Code facts it relies on) + orders/ (one work order per build)
│   └── .claude/                #   role personas (tech-lead, engineer = the executor, critic among them) + /paperclip /role /hire /where /decide /brief and the work commands /campaign /build /task /findings /handoff
├── engineering/                # LAYER 2 — project-agnostic intelligence; single source for install.sh AND the scaffold, and both write it the same way: files under .agents/, one .claude/<dir>/<entry> symlink each
│   ├── agents/                 #   platform-engineer, design-systems-engineer, mobile-engineer, playwright-test-{planner,generator,healer}
│   ├── commands/               #   grill, scaffold, feature, module, create/dispose/publish-worktree, playwright-test-{plan,generate,heal}
│   └── skills/                 #   guardrails, worktrees, mobile, web-verify, lib, better-auth ×4, playwright-agents
├── skeleton/                   # LAYER 3 — the boilerplate
│   ├── versions.json           #   every pinned version, referenced as "@versions" by base, surfaces and modules
│   ├── base/                   #   always emitted: root config, apps/server, shared/{contracts,domain,ui}, scripts, docs, README, AGENTS.md, hooks, CI
│   ├── surfaces/web/           #   apps/web + tests/ (Playwright) + web guards + docs/{web,ui}.md; surface.json
│   ├── surfaces/mobile/        #   apps/mobile + the Appium lane inside tests/ + mobile guards + docs/mobile.md; surface.json (requires: ["web"])
│   └── modules/<id>/           #   opt-in overlays (§5): module.json + files/ + docs/<id>.md
└── docs/                       # this file, MODULES.md (authoring guide), manifest.schema.json, manifest.example.json, module.schema.json
```

## 2. Flow

1. `~/paperclip-kit/install.sh [dir]` — layer 1 lands as real files (`CLAUDE.local.md`, `.paperclip/`, its
   own `.claude/{agents,commands}/*.md`); layer 2 lands in `.agents/{agents,commands,skills}` with a relative
   `.claude/<dir>/<entry>` → `../../.agents/<dir>/<entry>` symlink for each top-level entry. Per entry, not per
   directory, so the two layers share `.claude/agents` and `.claude/commands` — company files beside engineering
   links, distinct names (`/paperclip /role /hire /where /decide /brief` against `/grill /scaffold /feature
   /module`…), and `/hire` keeps writing a real `.claude/agents/<role>.md`. Anything already present is skipped,
   so a re-run is a no-op. Every installed path — links included — goes to `.git/info/exclude` when a `.git`
   exists. `.paperclip/kit.json` records `{ kitPath, version }`. `install.sh --new <dir>` creates the directory
   first. The scaffold then writes exactly this layout into the product tree: one source of truth, `.agents/`.
2. `paperclip on` → **`/grill`**: an interview, not a form — only what changes the generated tree
   (product, users, surfaces, data, auth, payments, LLM, notifications, analytics, hosting, compliance,
   team/tickets, naming, working style), then each selected module's `placeholders` questions. Each
   answer confirmed in one line; result written to `.paperclip/project.manifest.json` (`docs/manifest.schema.json`).
3. **`/scaffold`** → `bin/scaffold.sh --manifest .paperclip/project.manifest.json --out .` — checks every
   surface's and module's `requires` (one error listing all the missing pieces), copies base, the selected
   surfaces and the modules in dependency order, substitutes placeholders (file contents, every string of
   `module.json`/`surface.json`, the fragments), writes the gen files and merged files (§4), copies
   `engineering/` into `.agents/` with the same per-entry `.claude/` symlinks `install.sh` makes — an existing
   correct link is left alone silently, a real file where a link belongs is reported as a divergent copy and
   never clobbered — prints the checklist. Deterministic: same manifest, same tree. `--update` re-applies the
   manifest to an existing tree (regenerates gen and merged files, refreshes untouched kit files, never touches
   product-owned files, and leaves a vendor-generated file such as `apps/web/public/mockServiceWorker.js` — msw's
   postinstall owns its bytes — to its toolchain rather than calling it a product edit); `--dry-run` prints the plan.
4. Claude finishes what a script cannot: `HUSKY=0 yarn install` (first run — no `.git` yet for the hooks),
   `yarn routes:generate` (web), `yarn db:generate` (db-prisma), the modules' post-scaffold notes, then the
   gates — `typecheck`, `lint`, `lint:guards`, `test`, `test:contract`, `test:e2e:validate`, `test:e2e`
   (mock mode, hermetic). The project is "ready" only when every gate is green in the generated tree; then
   `/feature <name>` clones the `example` feature across every layer for the first real feature. Node is
   22.17.1 (`volta` reads the pin from `package.json`; nvm users `nvm use 22.17.1`).
5. **Then the company runs on the ledger.** `.paperclip/` is not only documents: `bin/pc` — always callable as
   `.paperclip/bin/pc`, from any subdirectory, and never installed on a PATH by the installer — writes one file
   per fan-out in `campaigns/`, one per task in `work/`, one per defect in `findings/`, the campaign contract in
   `contracts/`, reusable facts in `research/` — the single source of truth for what is in flight, so an agent
   killed mid-run is recovered from its file and a cold session resumes from `pc handoff` (`--campaign <id>` for
   one fan-out alone). `STATUS.md` stays the curated human view, §1 the Founder's parking lot, and `/where` reads
   both and says where they disagree. Multi-agent work goes through `/campaign`: the shared contract written
   first, one write-allowlist per task, and briefs composed from `.paperclip/briefs/_blocks.md` instead of
   retyped. Three of those rules are mechanical rather than remembered — `pc task new` **refuses** a `--scope`
   glob that overlaps any queued, running or blocked task (conservatively: it compares the literal head of each
   glob and calls a tie an overlap, so a false refusal costs a `--force` and a false pass cannot cost a corrupted
   tree; `pc scope check` asks the same question before anything exists, `--force` records the accepted overlap
   in the notes of both tasks); `pc campaign close` **refuses** while one of its tasks is unfinished or a finding
   one of them raised is still open, listing exactly what; and `pc estimate` reports median tokens per class
   beside median duration wherever the log rows carry `--tokens`/`--model`, so "mechanical work belongs on a
   cheap model" is checkable. `/task` and `/findings` keep the two queues legible; `/handoff` ends the session
   with a file that stands alone.
6. **One change, in depth: the build harness** (`template/.paperclip/HARNESS.md`, 0.3.0). One triage question —
   can the change and its proof be written in ~10 lines now? — routes engineering work: **Direct** (a
   mini-order through `/task` to `engineer`, the executor on a cheap model), **Guided** (`tech-lead` does it),
   or **Full** (`/build`: goal card → `tech-lead`'s work order in `.paperclip/orders/` → `critic` attacks it →
   probes → slices each followed by a checkpoint → a close review whose findings are tagged plan-gap or
   execution-gap). A build is a campaign: its plan, critique, probe, slice and checkpoint tasks are `pc` tasks
   with stable classes, a slice's allowed paths are its `--scope`, and `pc campaign close` is its close gate.
   The harness adds no CLI: surprises are `surprise:` task notes and the gap tags are finding-title prefixes
   (dedicated `pc` commands are follow-ups in `UPGRADE.md`). The Claude Code behaviour it relies on — agent
   frontmatter (`model`, `effort`, `disallowedTools`), resume through `SendMessage`, the per-call model
   override, hot reload, the worktree guard — is listed with its evidence level in `HARNESS.md` §10. Validated
   on one build; a second pilot of a different shape is recommended.

## 3. The generated product (skeleton contract)

One product per repo, at the repo root, shaped like the source package: up to three apps, shared code that
never imports from an app, one e2e workspace. No Nx (room is left to move under `packages/` later).

```
<product>/
├── package.json                 # yarn 4; workspaces start empty — web adds "tests", mobile "apps/mobile", db-prisma "db"; server + web deps at the root; volta pin node 22.17.1 / yarn 4.18.0
├── .yarnrc.yml .editorconfig .gitignore .env.example tsconfig.json vitest.config.ts nest-cli.json webpack.config.js commitlint.config.cjs
├── biome.json  biome/*.grit     # guards; scripts/lint-canary/{canaries.json,*.fixture.*} proves each fires
├── README.md                    # how to run, the gates, worktrees, where rules and docs live
├── apps/server/src/             # NestJS 11
│   ├── main.ts  app.module.ts (product features)  app.modules.gen.ts (KIT_MODULES, KIT_PORTS, KIT_RAW_BODY_PATHS)
│   ├── common/{api-error.ts, api-error.filter.ts, zod.pipe.ts, raw-body.ts} + specs (request-pipeline.integration.spec.ts)
│   ├── common/ports/{notification,analytics,telemetry}.ts   # interface + Symbol token + <Port>ConsoleProvider each; ports.module.ts (@Global PortsModule); index.ts
│   └── health/  example/        # health = config/controller/module/types; example = module/controller/service/store.memory/types + specs
├── apps/web/                    # [web] React 19 + Vite 6 + TanStack Router (file routes) + Query; Tailwind over shared/ui tokens
│   ├── index.html vite.config.ts tsr.config.json tailwind.config.js postcss.config.js tsconfig.json vitest.setup.ts public/{mockServiceWorker.js,…}
│   └── src/ main.tsx  app/{App.tsx, router.tsx, mocks.ts, RouteError.tsx, RoutePending.tsx, kit.types.ts, kit.gen.tsx}  app/routeTree.gen.ts (gitignored; `yarn routes:generate`)
│       ├── app/routes/{__root.tsx, index.tsx, _app.tsx, _app/example.index.tsx, _app/example.$id.tsx, _app/settings.tsx}
│       ├── lib/{http.ts, queryClient.ts, copyMarks.tsx, motion.ts, useScreenTag.ts, version.ts}  data/store.ts  testing/{renderScreen.tsx, routes.ts, seeds.ts}
│       └── features/{shell,example,settings}/{screens,hooks,components}
├── apps/mobile/                 # [mobile; requires web] Expo 54 + expo-router 6 + NativeWind 4
│   ├── app.config.js eas.json .eas/workflows/*.yml metro.config.cjs babel.config.js index.ts plugins/withPhoneOnly.cjs scripts/ assets/
│   ├── app/{_layout.tsx, index.tsx, +not-found.tsx, (app)/{_layout.tsx, (tabs)/{_layout,example,settings}.tsx, example/[id].tsx}}
│   └── src/{kit.types.ts, kit.gen.tsx, lib/*, data/{store,launch}.ts, features/{shell,example,settings}}  test/{setup.ts, renderScreen.tsx, stubs/}  vitest.config.ts
├── shared/contracts/            # one endpoint = one module + .mock.ts beside it; http.ts errors.ts http-errors.ts mock-state.ts mock-response.ts; health/ example/; mocks.ts mocks.gen.ts
├── shared/domain/               # copy.ts barrel, fill.ts, {example,settings,shell}/copy.ts, shell/tabs.ts, flow/ (pure flow engine + spec)
├── shared/ui/                   # tokens.css base.css cn.ts motion-tokens.ts motion.ts fieldComplaint.ts components/{Button(.native).tsx, buttonVariants.ts, ScreenPending.tsx, Wordmark(.native).tsx}
├── tests/                       # [web] Playwright workspace @<scope>/e2e: playwright.config.ts config/ fixtures/web.ts helpers/ elements/*.yaml pages/web specs/web/{contract,smoke,regression} script/validate-*.mjs docs/
│                                #   [mobile] adds appium/{wdio.conf.ts, capabilities/{android,ios}.ts}, pages/mobile, specs/mobile/{smoke,regression}, tsconfig.appium.json
├── scripts/                     # check-lint-guards.mjs check-test-contract.mjs test-contract.allow.json run-if-script.mjs lint-canary/ wt/ (worktree CLI + wt.config.sh)
├── docs/                        # README architecture glossary server checks linting worktrees branching (+ web, ui [web]; mobile [mobile]; <id> per module); <!-- kit:modules --> marker in README
├── .agents/{agents,commands,skills}     # the source of truth — edit only here
├── .claude/{settings.json, hooks/, agents/<entry>→, commands/<entry>→, skills/<entry>→}  .mcp.json   # one symlink per entry into .agents/; the company layer's own files sit beside them
├── .github/{workflows/ci.yaml, PULL_REQUEST_TEMPLATE.md} (+ workflows/mobile-delivery.yaml [mobile])  .husky/  Dockerfile  Dockerfile.dockerignore  deploy/config.yaml
├── .paperclip/{project.manifest.json, scaffold.lock.json}   # the two tracked files; the rest of .paperclip/ is local
├── AGENTS.md (CLAUDE.md → symlink)   # the rules that hold on every edit; <!-- kit:module-rules --> marker
└── .spec/README.md              # plans not yet built, deleted when shipped
```

### Fixed decisions (every builder conforms; deviations are reported, not improvised)

- **Aliases** (identical in web, mobile, server, tests, vitest): `~/*` → the app's `src/*`; `@contracts/*` →
  `shared/contracts/*`; `@domain/*` → `shared/domain/*`; `@ui/*` → `shared/ui/*` (`.native.tsx` resolved first on
  mobile); `@domain/copy` is the copy barrel (base sections only — a module imports `@domain/<feature>/copy`).
  Apps import the endpoint module (`@contracts/example/list-items`), never a feature barrel (it holds msw handlers).
- **Scripts** (root `package.json`) — base: `dev` (server + `dev:client` when present, via `scripts/run-if-script.mjs`),
  `dev:server`, `build`, `build:server`, `start`, `typecheck` (server build tsconfig + every `typecheck:*`), `lint`
  (`biome check .`), `lint:guards`, `test` (`vitest run` + `test:mobile` when present), `test:contract`, `wt`, `prepare`
  (husky). Web adds `dev:client`, `dev:mock` (`VITE_API_MODE=mock`), `build:client`, `routes:generate`
  (`yarn --cwd apps/web tsr generate`), `typecheck:web`, `typecheck:tests`, `test:e2e`, `test:e2e:validate`,
  `test:web:{contract,smoke,regression}`. Mobile adds `mobile`, `mobile:mock`, `typecheck:mobile`,
  `typecheck:tests:appium`, `test:mobile`, `test:mobile:{smoke,regression}`. Modules add theirs through
  `packages.root.scripts` (`db:*`, `copy:diff`, `analytics:coverage`, `example:repl`, `build:{sentry,otel}-preload`).
- **Ports**: server 3000, web 5173, metro 8300 — the base ports for worktree slots (`base + 10 × slot`).
- **The `example` feature** — the golden path, present in every layer, cloned by `/feature`:
  - Contract `shared/contracts/example/`: `item.ts` (`Item = { id: slug, title: 1..120, note: 0..500, done: boolean,
    updatedAt: iso }`), `list-items.ts` (`GET /api/example/items` → `{ items: Item[] }`, `listItemsQuery(http)` key
    `["example","items"]`), `get-item.ts` (`GET /api/example/items/:id` → `Item`; 404 `NOT_FOUND`),
    `set-item-done.ts` (`PUT /api/example/items/:id/done` body `{ done }` → `Item`), `errors.ts` (`ExampleFlowError`,
    closed reasons), `mock-library.ts` (3 seed items, one of them done — the fixture is the truth the specs follow),
    `mock-item-state.ts` (cookie ledger of `done` flags), `*.mock.ts` (`fixture = Schema.parse(...)`, handlers on
    `*/api/example/...`), `index.ts` (handlers). Public in base (no session guard exists in base; the auth module
    documents how to guard).
  - Server `apps/server/src/example/`: `example.module.ts`, `example.controller.ts` (`@ZodBody`), `example.service.ts`,
    `example.store.memory.ts` (structural `ExampleStore`), `example.types.ts` (`EXAMPLE_STORE` symbol), specs beside.
  - Web `features/example/`: `screens/ExampleList.tsx`, `screens/ExampleDetail.tsx`, `hooks/useExampleItems.ts`,
    `hooks/useExampleActions.ts`, `derive.ts`, specs beside; routes `_app/example.index.tsx`, `_app/example.$id.tsx`;
    testids `example-list-*`, `example-detail-*`; screen tags `example-list`, `example-detail`; e2e
    `tests/specs/web/contract/example/{example-list,example-detail}.spec.ts` (one keyboard-only variant; one
    `page.reload()` assertion on the done flag; one `route-error` assertion).
  - Mobile `features/example/` mirrors web (screens, hooks, `derive.ts` — duplicated on purpose for now, a candidate
    for `shared/domain/example/derive.ts`); routes `(app)/(tabs)/example.tsx`, `(app)/example/[id].tsx`.
  - Shell: `shared/domain/shell/tabs.ts` → `TAB_DESTINATIONS` (`as const` record: `example`, `settings`);
    `shell/copy.ts` → `SHELL_COPY.{tabs, pending, error.{title,body,retry}}` (web `RouteError`, mobile `ScreenFailed`).
    Settings renders `KIT_SETTINGS_ACTIONS` + the version.
  - Health: `GET /api/health` → `{ ok: true, version }` — `shared/contracts/health/get-health.ts` (`getHealthQuery`,
    key `["health"]`, `staleTime` ∞), server `health/`; read by a load balancer's probe, the e2e readiness wait and
    the settings screen's version line.
- **Mock mode**: `VITE_API_MODE=mock` (web), `EXPO_PUBLIC_API_MODE=mock` (mobile); `shared/contracts/mocks.ts`
  = `[...health, ...example, ...KIT_HANDLERS]`; e2e answers every `/api` through `getResponse(handlers)`; fail closed.
  The e2e web server is `dev:client` without mock mode — `page.route` answers `/api`, so the suite needs no server.
- **Placeholders** — substituted in file contents (never file names), in every string of `module.json` /
  `surface.json` (keys included) and in `.env.fragment` / `agents-fragment.md`: `__PRODUCT_SLUG__` (kebab),
  `__PRODUCT_NAME__`, `__SCOPE__` (npm scope without `@`), `__COOKIE_PREFIX__`, `__BUNDLE_ID__`, `__SCHEME__`,
  `__DOMAIN__`, `__TRUNK__` (default `development`), `__DB_NAME__`, plus each module's own `placeholders`, whose
  defaults may name a base one (`no-reply@__DOMAIN__`). Anything else product-specific is Claude's job after scaffold.
- **Versions** live once in `skeleton/versions.json`; base, surface and module `package.json` fragments name the
  package and take the version from there (`"zod": "@versions"`; a package missing there fails the scaffold).
  Headline pins as of 0.2.0 (proven together in production): nest ^11 · express ^5 via platform-express ·
  react/react-dom 19.1.0 (one React for web and RN) · vite ^6 · @vitejs/plugin-react ^4 · @tanstack/react-router ^1.170 ·
  router-plugin ^1.168 · router-cli ^1.167 · react-query ^5.102 · react-form ^1.33 · zod ^4.3 (resolution ^4) ·
  msw ^2.15 · motion ^12 · lucide-react ^0.441 · cva ^0.7 · clsx ^2 · tailwind-merge ^2.6 · tailwindcss ^3.4 · vitest ^3 ·
  jsdom ^25 · @testing-library/react ^16 (+ dom ^10.2, jest-dom ^6, user-event ^14) · @biomejs/biome ~2.5.12 ·
  typescript 5.9.2 · tsx ^4.20 · concurrently ^9 · webpack-node-externals ^3 · @playwright/test ^1.60 · yaml ^2.7 ·
  webdriverio + @wdio/* ^9 · expo ~54 · react-native 0.81.5 · expo-router ~6 · expo-constants ~18.0.14 · nativewind ^4.2 ·
  reanimated ~4.1 · react-native-purchases 10.9 · better-auth 1.4.19 (+ @better-auth/{core,expo,stripe}) ·
  prisma / @prisma/client / @prisma/adapter-pg 7.7.0 · pg ^8.12 · stripe ^20 · @sentry/nestjs ^10.71 (+ react ^10.71,
  react-native ^7) · openai ^6.17 · @anthropic-ai/sdk ^0.57 · @google/genai ^2.9 · ai ^7 · @ai-sdk/xai ^4 ·
  @openai/agents ^0.17 · @sendgrid/mail ^8.1 · twilio 5.4.5 · expo-server-sdk ^3.15 · mongodb ^6.11 ·
  @opentelemetry/{api ^1.9, sdk-node ^0.203, exporter-trace-otlp-http ^0.203} · husky ^9.1 · commitlint ^19.8 ·
  node 22.17.1 · yarn 4.18.0.

## 4. Extension slots (how modules plug in without editing base files)

Every slot is either a **generated file** (rewritten from the manifest on every scaffold/update) or a
**merged file** (base content + fragments). Product-owned files are never rewritten.

| slot | file | what modules contribute (`module.json` key) |
|---|---|---|
| server modules | `apps/server/src/app.modules.gen.ts` → `KIT_MODULES: Type[]` | `server.modules: [{ import: "./auth/auth.module", symbol: "AuthModule" }]` |
| server ports | same file → `KIT_PORTS: Provider[]` (exactly one provider per port, in declaration order: base's notification · analytics · telemetry, then every port a layer declares, in dependency order; an unclaimed port gets its declaring layer's default) | `server.portDefaults: { "<port>": { import, symbol } }` **declares** a port and the default provider that stands in until it is claimed (base's three are engine built-ins); `server.ports: { "<port>": { import, symbol } }` **claims** a declared one. Declaring a port twice, claiming one nobody declared, and two claims on one port are errors |
| raw-body paths | same file → `KIT_RAW_BODY_PATHS: string[]` | `server.rawBodyPaths: ["/api/auth/stripe/webhook"]` |
| contract mocks | `shared/contracts/mocks.gen.ts` → `KIT_HANDLERS` (spread into `mocks.ts` after `health` and `example`) | `contracts.handlers: [{ import: "./auth", symbol: "handlers" }]` |
| web providers / gates / boot / settings | `apps/web/src/app/kit.gen.tsx` → `KIT_PROVIDERS`, `KIT_GATES`, `KIT_BOOT`, `KIT_SETTINGS_ACTIONS` | `web.providers`, `web.gates`, `web.boot`, `web.settingsActions` (each `{ import, symbol }`, `~/` paths) |
| mobile providers / gates / boot / settings | `apps/mobile/src/kit.gen.tsx` (same four exports) | `mobile.*` (same shape) |
| routes | web `app/routes/**`, mobile `app/**` — modules ADD route files; `apps/web/src/app/routeTree.gen.ts` is gitignored and produced by `yarn routes:generate` (the router plugin also rewrites it on every dev/build) | files under `files/` |
| prisma schema | `db/prisma/schema/<module>.prisma` (Prisma multi-file schema) | files under `files/`; `requires: ["db-prisma"]` |
| env | `.env.example` (base + fragments with a `# --- <id>: <title> ---` header) | `files/.env.fragment` |
| package.json | root, `apps/mobile`, `tests`, `db` — deps/devDeps/scripts/workspaces merged | `packages: { root: {dependencies, devDependencies, scripts, workspaces}, mobile: {...}, tests: {...}, db: {...} }` |
| biome | `biome.json` — `plugins` appended; `overrides` inserted **before** the server override (parser must stay last) | `biome.plugins: ["./biome/llm-provider-imports.grit"]`, `biome.overrides: [{...}]` |
| canaries | `scripts/lint-canary/canaries.json` — entries merged | `canaries: [{ plugin, fixture, dest, expect }]` + fixtures under `files/scripts/lint-canary/` |
| hooks | `.claude/settings.json` — PostToolUse entries appended | `hooks: [{ if, command, timeout, statusMessage }]` + scripts under `files/.claude/hooks/` |
| docs | `docs/<id>.md` copied; line inserted at `<!-- kit:modules -->` in `docs/README.md` | `docs: "docs/<id>.md"` |
| AGENTS.md | fragment inserted at `<!-- kit:module-rules -->` inside `<!-- kit:module:<id> -->` markers | `files/agents-fragment.md` |
| test-contract allowlist | `scripts/test-contract.allow.json` entries merged | `testContractAllow: [...]` |

Gate contracts (types live in base):
- web `Gate = (ctx: { queryClient: QueryClient; location: ParsedLocation }) => Promise<Record<string, unknown> | void>`;
  `_app.tsx` runs `KIT_GATES` in order in `beforeLoad`, merges what each returns and returns it `as GateContext`
  (a gate throws `redirect` to turn the user away). `GateContext` is an **empty interface** in
  `apps/web/src/app/kit.types.ts`; a module names what its gate grants from its own files —
  `declare module "~/app/kit.types" { interface GateContext { session: SessionRecord } }` — so a route under `_app`
  reads a typed `Route.useRouteContext().session` and base never names a session.
- mobile `Gate = () => { ready: boolean; allow: boolean; redirectTo?: Href }` (a hook); `app/_layout.tsx` calls
  each in `useAppGates()` and renders `Stack.Protected guard={allow}`; `index.tsx` redirects to the first `redirectTo`.
- `SettingsAction = { id: string; label: string; run: () => Promise<void> | void; tone?: "default" | "danger" }`.
- `Provider = React.ComponentType<{ children: React.ReactNode }>`; `Boot = () => Promise<void> | void` (run once before mount).

Server ports: `apps/server/src/common/ports/{notification,analytics,telemetry}.ts` — each an interface, a `Symbol`
token (`NOTIFICATION_CLIENT`, `ANALYTICS_CLIENT`, `TELEMETRY`) and a `<Port>ConsoleProvider`; `ports.module.ts` is
the `@Global()` `PortsModule` that binds `KIT_PORTS`. A module claims a port by exporting a Nest `Provider` for that token.

`module.json` also carries: `id`, `title`, `summary`, `requires: string[]` (module ids and/or surfaces — honoured for
surfaces too: `mobile` requires `web`), `surfaces: ("web"|"mobile")[]` (files under `files/apps/web/**` or
`files/apps/mobile/**` are copied only when that surface is selected), `placeholders` (extra keys the grill must
ask for), `postScaffold: string[]` (notes printed after scaffold, e.g. "run `yarn db:generate`"). Full spec: `docs/MODULES.md`.

## 5. Modules

Ids, titles and summaries as shipped under `skeleton/modules/` (the `module.json` is the truth).

| id | title | requires | adds | guarded by |
|---|---|---|---|---|
| `db-prisma` | Database (Prisma) | — | Postgres through Prisma 7: the `db` workspace (`@<scope>/db`: multi-file schema, migrations, seed, generated client; scripts `db:generate`, `db:migrate`, `db:migrate:deploy`, `db:seed`, `db:studio`, `db:reset`, `typecheck:db`), server `database/` (one pool per process behind the `PRISMA` token, the single import seam, an optional scope extension), `openPrisma()` for scripts, `docker-compose.db.yml`, the `wt --db` rule | `prisma-pool-boundary`, `db-seam` |
| `auth-better-auth` | Auth (Better Auth) | `db-prisma` | email-code sign-in with optional Google and Apple; one session on both transports (browser cookie jar, phone `Cookie` header from secure storage); `SessionGuard`; server `auth/` + `account/`; contracts `auth/*`, `account/*`; web gate `requireSession` + settings actions; mobile boot `bootSession`, gate `useSessionGate`, settings actions; a mocked session that is a real cookie. Placeholder `__AUTH_FROM_EMAIL__` | testing contract |
| `payments-stripe` | Payments (Stripe) | `auth-better-auth` | subscriptions sold on the web through Stripe Checkout: server `subscription/` (the `@better-auth/stripe` plugin, the raw webhook body, the deduplicated `webhook_event` trail, access computed once on the server → carried on the session, `SubscriptionGuard`), the `auth-extensions` port, contracts `subscription/*`, `subscription.prisma`, web paywall + checkout return + the pathless `_app/_paid` layout calling `requireAccess` + settings actions; with no `STRIPE_SECRET_KEY` billing is inert rather than broken | webhook path `/api/auth/stripe/webhook` in `KIT_RAW_BODY_PATHS` |
| `payments-revenuecat` | Payments (RevenueCat) | `payments-stripe`, `mobile` | subscriptions sold on the phone by Apple and Google through RevenueCat, settled onto the entitlement `payments-stripe` already computes: server `subscription/revenuecat/` (REST reader, header-authed webhook that always answers 200, `POST /api/subscription/revenuecat/confirm` where the server reads RevenueCat rather than trusting the device), contracts `subscription/store*` + `confirm-store-purchase`, mobile `lib/store/` seam (the SDK lazily loaded, a mock store in mock mode), `StoreIdentityProvider`, gate `useAccessGate`, paywall screen + settings actions, the `withReactNativeAndroidRoot` config plugin the Android build needs; off until `REVENUECAT_SECRET_KEY` is set | `revenuecat-sdk-imports` |
| `llm` | LLM | — | one `LlmClient`/`AgentRunner` port over a registry of services with failover chains; retries, structured-output repair, streaming and telemetry live once; openai/anthropic/google/xai adapters plus a deterministic fake; `example.agent.ts` + `example.repl.ts` samples (`yarn example:repl`); `LLM_MODE=fake\|real` | `llm-provider-imports`, `openai-agents-imports` |
| `notifications` | Notifications | — | the `notification` port for real: email through SendGrid, SMS through Twilio, push through Expo, behind `NOTIFICATION_MODE=fake\|real` with console adapters (`providers/<channel>/console.adapter.ts`), typed templates, one telemetry event per send | `notification-provider-imports` |
| `analytics` | Analytics | — | the `analytics` port for real: one PHI-safe event contract every layer shares, a batching queue on web and mobile, one server door `POST /api/analytics/events`, MongoDB behind `ANALYTICS_MODE=fake\|real` with a console store by default, `yarn analytics:coverage`, the advisory screen-reminder hook | `analytics-provider-imports`; hook `analytics-reminder.sh` |
| `observability-sentry` | Observability (Sentry) | — | the `telemetry` port for real: one JSON line per call on the console always, Sentry beside it once a DSN is set — errors only, PHI-safe — server (`observability/`, `SENTRY_DSN`), web (`bootSentry`, `SentryBoundary`, `VITE_SENTRY_DSN`), mobile (`bootSentry`, `EXPO_PUBLIC_SENTRY_DSN`); optional `build:sentry-preload` | — |
| `telemetry` | Telemetry | — | a request id on every request, structured JSON logs through one logger, one OpenTelemetry span per request (console in dev, OTLP by env); optional `build:otel-preload`. Does not bind the `telemetry` port | `no-console-in-domain` (exempt: `console.adapter.ts`, `*.repl.ts`, `main.ts`, `telemetry/**`, `common/ports/**`, specs) |
| `copy-diff` | Copy diff | — | `yarn copy:diff` holds `@domain/copy` byte-equal to a reference copy module (`COPY_DIFF_PATH`, optional `COPY_DIFF_REF`) behind a reasoned allowlist; `typecheck:copy-diff`; a CI step documented in `docs/copy-diff.md` | CI `copy:diff` |

Every module must pass the gates alone on top of base (+ its `requires`, with both surfaces), and all together —
the matrix and its commands are `MODULES.md` §6; the proven rows are §8 below.

## 6. What the kit deliberately does not do
- Copy product code. Screens, rules, copy, prompts, event vocabularies are rewritten as the one `example` feature.
- Pick a host. Dockerfile, a path-filtered CI (install → generate → typecheck → lint → guards → contract → unit →
  e2e validate → e2e lanes → image) and a `deploy/config.yaml` shape (env → buildArgs/envVars/secrets/runtime) ship;
  the deploy step is a documented slot.
- Add Nx, i18n, or a CMS. One product per repo; add when the second product arrives.

## 7. Build plan and ownership
- **W0** inventory of the source package → scratchpad `inventory-*.md`. Done.
- **W1** (parallel): **A** kit core (`install.sh`, `bin/`, `docs/MODULES.md`, `docs/manifest.schema.json`, `engineering/commands/{grill,scaffold,feature,module}.md`, README) · **B** base spine (`apps/server`, `shared/contracts`, `shared/domain`, `vitest.config.ts`, `nest-cli.json`, `webpack.config.js`, server tsconfigs, `docs/{architecture,server}.md`) · **C** web surface (`apps/web`, `shared/ui`, `tests/`, web guards + canaries, `docs/{web,ui}.md`, `tests/docs`) · **D** mobile surface (`apps/mobile`, Appium bits, mobile guards + canaries, `docs/mobile.md`, `engineering/skills/mobile`, mobile-delivery workflow) · **E** guardrails + knowledge (root config files, `biome.json`, base grits + fixtures, `scripts/{check-lint-guards,check-test-contract}.mjs`, `.claude/{settings.json,hooks}`, `AGENTS.md`, `docs/{README,glossary,checks,linting,branching}.md`, `.spec/README.md`, `.github/`, `Dockerfile*`, `deploy/`, `.husky`, `.mcp.json`, `engineering/{skills,commands,agents}` for guardrails/web-verify/lib/better-auth/playwright) · **F** worktrees + company layer (`scripts/wt/**`, `docs/worktrees.md`, `engineering/skills/worktrees`, `engineering/commands/*-worktree.md`, `engineering/agents/{platform,design-systems,mobile}-engineer.md`, template PLAYBOOK/persona/hire/CLAUDE.local.md diffs). Done.
- **W2** (parallel, one agent per module): the modules of §5. All ten shipped, the two payments modules last.
- **W3** integration: scaffold `base`, `base+web`, `base+web+mobile`, each module alone, and all modules; install; run
  every gate; fix until green. Pass 1 (copy keys, hygiene, engine `requires` for surfaces, placeholder substitution in
  manifests and fragments, webpack allowlist) done; the closing matrix — all fourteen rows, the refusals, idempotence,
  the Docker path and install-to-gates — run and green, in §8. Done.
- **W4** knowledge polish: this file, `MODULES.md`, README, the commands, the templates, the generated README,
  `RouteError` copy keys, `webpack-node-externals` pinned. Done with this revision. The build is finished.

## 8. Verified state

Every row below is a **fresh scratch tree scaffolded by the real engine** (`bash bin/scaffold.sh --manifest
<row>.json --out <dir>`, product slug `acme-notes`, scope `acme`), then `HUSKY=0 yarn install` and the gates in
order. Rows 1–14 were run by the W3 closer on 2026-09-10; row 14 was re-run end to end by the `telemetry` module
builder after the fix below, and that re-run is the row's recorded outcome. Kit 0.2.0, macOS 15.5, node 22.17.1,
yarn 4.18.0. Nothing here is inferred: a gate not listed for a row was not run on that row, and every figure is
the number some agent's own run printed.

Gate set per row — `install` · `db:generate` (db-prisma) · `routes:generate` (web) · `typecheck` · `lint` ·
`lint:guards` · `test` · `test:mobile` (mobile) · `test:contract` · `test:e2e:validate` (web). Browser-suite
economy: the full `test:e2e` was run on **row 3** (web+mobile, no modules) and **row 14** (web+mobile, all ten)
only — the two ends of the matrix; every other web row stopped at `test:e2e:validate`, which checks the specs and
their element keys without a browser. Ports ≥ 5985, never 5173/3000/8081.

| # | manifest `surfaces` · `modules` | gates | outcome |
|---|---|---|---|
| 1 | `[]` · `[]` | install, typecheck, lint, lint:guards, test, test:contract | green |
| 2 | `["web"]` · `[]` | + routes:generate, test:e2e:validate | green |
| 3 | `["web","mobile"]` · `[]` | + test:mobile, **test:e2e** | green — lint 271 files, test 143, test:mobile 61, e2e 12 passed |
| 4 | `[]` · `["db-prisma"]` | + db:generate | green |
| 5 | `[]` · `["llm"]` | base set | green |
| 6 | `[]` · `["notifications"]` | base set | green |
| 7 | `[]` · `["telemetry"]` | base set | green |
| 8 | `[]` · `["copy-diff"]` | base set | green |
| 9 | `["web","mobile"]` · `["analytics"]` | full, no e2e | green |
| 10 | `["web","mobile"]` · `["observability-sentry"]` | full, no e2e | green |
| 11 | `["web","mobile"]` · `["db-prisma","auth-better-auth"]` | full, no e2e | green |
| 12 | `["web","mobile"]` · `+ ["payments-stripe"]` | full, no e2e | green |
| 13 | `["web","mobile"]` · `+ ["payments-revenuecat"]` | full, no e2e | green |
| 14 | `["web","mobile"]` · **all ten** | full, **test:e2e** | **green** — every gate, `test` included |

**Row 14 in detail**, as the `telemetry` builder's acceptance run printed it: scaffold · `HUSKY=0 yarn install` ·
`db:generate` · `routes:generate` · `typecheck` · `lint` · `lint:guards` all pass; `yarn test` **133/133 files,
930/930 tests, zero failed files**; `test:mobile` **32 files / 137 tests**; `test:contract` and
`test:e2e:validate` pass; `test:e2e` **42/42**. The closer's earlier pass over the same combination had `test`
red on a single suite: `apps/server/src/telemetry/telemetry.integration.spec.ts` imported the real `PortsModule`,
which with `payments-stripe` selected gains `SubscriptionAuthExtensionsProvider` and its `PRISMA` dependency — a
genuine combination failure, invisible on every other row. The spec now builds its ports in a local `@Global()`
module, the pattern base's own `common/request-pipeline.integration.spec.ts` documents. Single-module regression
rows for `telemetry` and `observability-sentry` were re-run green afterwards, and `["web"]` × `observability-sentry`
proved the new mobile env fragment is skipped silently when there is no mobile surface.

`apps/mobile/.env.example` now carries both mobile Sentry keys — `EXPO_PUBLIC_SENTRY_DSN` and
`EXPO_PUBLIC_SENTRY_ENVIRONMENT` — from `observability-sentry`'s `files/apps/mobile/.env.fragment`; the second
key had been prose-only.

**Refusals** (each printed one error and wrote nothing — no output directory was created):
`["mobile"]` alone → *surface "mobile" requires surface "web"*; `["web"]` + `["payments-revenuecat"]` → *requires
"payments-stripe"* and *requires surface "mobile"*; `modules: ["does-not-exist"]` → *skeleton/modules/…/module.json
does not exist*, listing the ten available ids.

**Idempotence** (row 14). `--update` on the untouched tree rewrote nothing: symlinks and the manifest kept, every
other file byte-identical, and the only byte that changed anywhere in the tree was `.paperclip/scaffold.lock.json`.
`apps/web/public/mockServiceWorker.js` is classed vendor-generated (msw's postinstall owns those bytes), so an
untouched tree now reports **no product edits at all**. With one product file (`example.service.ts`) and one gen
file (`app.modules.gen.ts`) hand-edited, `--update` left both alone and named them: *skipped (edited by the
product)* and *skipped gen (edited; use --force-gen)*. `--update --force-gen` rewrote the gen file and still left
the product edit in place.

**Docker, row 14** (Docker Desktop 24.0.5), run by the matrix agent. Postgres 16 from the tree's own
`docker-compose.db.yml` on port 5494; `yarn db:migrate --name init` applied `20260910140728_init`; `yarn db:seed`
wrote the 3 example rows; `nest build` produced `apps/server/dist/main.js`; the built server booted on port 3996.
Then, over HTTP: `GET /api/health` → 200 `{"ok":true,"version":"0.1.0"}` · `GET /api/example/items` → 200 with the
seeded rows · `GET /api/example/items/no-such-item` → 404 `{"code":"NOT_FOUND","message":…}`, exactly the
`{code,message,issues?}` envelope · `POST /api/analytics/events` with a valid batch → 202 `{"accepted":1}` and
with a free-text `screen` → 400 `VALIDATION` naming `events.0.event.screen` as *a slug*. The container and its
volume were removed.

**Install to gates** — the only proof that the two halves compose. `install.sh` writes the engineering layer to
`.agents/` (6 agents, 10 commands, 10 skill directories) and creates **26 per-entry relative symlinks** under
`.claude/`; the company layer stays real files beside them, no name collisions; every installed path, links
included, is registered in `.git/info/exclude`. The scaffold resolve-compares those links: a correct link is kept
silently, a real file where a link belongs is reported as `shadowed` and never clobbered.

- *Founder path*, clean directory, re-run end to end: `install.sh --new` → a manifest written by hand as `/grill`
  would write it (`harbor-notes`/`harbor`, `["web","mobile"]`, `db-prisma auth-better-auth analytics
  observability-sentry llm`) → scaffold → gates. **484 added / 39 overwritten / 26 kept / 0 shadowed**, all 26
  `.claude` entries resolving into `.agents/`, no duplicate copies of any engineering file, no placeholders left,
  and the tree's gates green through `test` and `test:contract`.
- *Existing repo*: same layout, `git status` clean, all **81** installed paths ignored, and a second `install.sh`
  run changing nothing.

**Proven by the module builders, not by this run** (recorded here because it is the only place the state is
collected). Live-Postgres exercise belongs to the builders of `db-prisma`, `auth-better-auth`, `telemetry`,
`payments-stripe` and `payments-revenuecat`, each against a real database in their own tree. For payments that
covered billing-off 503s, `access` on the session, the sold-elsewhere guard refusing cancel, restore and
billing-portal without any request reaching Stripe; and, on the store side, webhook auth, dedupe on redelivery, a
poison body, the cancellation paths, and the full chain store webhook → row → `accessFrom` → the `auth-extensions`
port → `customSession` reporting `"provider":"revenuecat"`. The engine's own unit suite
(`node --test bin/lib/*.test.mjs`) stands at **52 tests — 51 pass, 1 skipped** (the Biome-format check, skipped
without a Biome binary).

**Not proven — by anyone, anywhere:** no Android emulator or iOS simulator run and no Appium lane execution
(every mobile spec skips itself without `APP_PATH`); no EAS build, OTA update or store submission; no real call to
Stripe, RevenueCat, Sentry, SendGrid, Twilio, Expo push, MongoDB, an OTLP collector or any LLM provider — every
one of those was exercised in fake/off mode only; no production deploy; no build of the `Dockerfile` and no run of
`deploy/config.yaml` (the Docker evidence above is Postgres from `docker-compose.db.yml`, `nest build` and a boot,
nothing more); no CI run of `.github/workflows/ci.yaml`; and `copy:diff` was never run against a real reference
module.
