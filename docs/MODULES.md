# Authoring a module

A module is an opt-in overlay on the base skeleton: files the scaffold copies, plus declarations the
scaffold turns into generated and merged files. The engine is `bin/lib/scaffold.mjs`; the contract it
implements is [`ARCHITECTURE.md`](ARCHITECTURE.md) §3–§4. This guide is the spec a module author needs.

## 1. Layout

```
skeleton/modules/<id>/
├── module.json          # the declaration (spec in §3); id must equal the directory name
├── files/               # copied over base + surfaces, placeholders substituted in text files
│   ├── .env.fragment    # appended to .env.example under "# --- <id>: <title> ---" (not copied as a file)
│   ├── agents-fragment.md   # inserted into AGENTS.md between kit:module markers (not copied as a file)
│   ├── apps/server/src/<id>/…      # server code
│   ├── apps/web/…                  # copied only when the web surface is selected
│   ├── apps/mobile/…               # copied only when the mobile surface is selected
│   ├── tests/…                     # copied only when web is selected (the Playwright workspace rides with web)
│   ├── shared/contracts/<id>/…     # contracts + .mock.ts beside each endpoint
│   ├── db/prisma/schema/<id>.prisma   # only with requires: ["db-prisma"]
│   ├── biome/<id>-*.grit  scripts/lint-canary/<id>.fixture.*   # guards + the canary that proves each fires
│   └── .claude/hooks/<id>-*.sh     # hook scripts referenced from module.json hooks
└── docs/<id>.md         # the module's page; copied to docs/<id>.md and linked from docs/README.md
```

The same rules apply to `skeleton/base` and `skeleton/surfaces/<web|mobile>`, with one difference: their
files sit at the layer root (or under `files/` if that directory exists), and an optional `module.json`
(surfaces may name it `surface.json`) beside them carries the layer's contributions — a surface adds
its scripts, canaries, `postScaffold` notes and `.env.fragment` the same way a module does. That file
is consumed, never copied. A surface's `requires` is honoured exactly like a module's: `mobile`
declares `"requires": ["web"]` (its Appium lane lives in the `tests/` workspace web owns), and a
manifest with `["mobile"]` alone fails before anything is copied, listing every missing surface or
module the same way a module's unsatisfied `requires` does.

**Copy order** is base → `web` → `mobile` → modules in dependency order (a module's `requires` come
first; ties keep the manifest order). A later layer overlays an earlier one file by file — the only
legitimate reason to ship a path base already has is a new workspace file such as `db/package.json`.
File names are never substituted; file contents of text files are (`__PRODUCT_SLUG__`,
`__PRODUCT_NAME__`, `__SCOPE__`, `__COOKIE_PREFIX__`, `__BUNDLE_ID__`, `__SCHEME__`, `__DOMAIN__`,
`__TRUNK__`, `__DB_NAME__`, plus the module's own `placeholders`). Binary files (by extension, or
anything that is not valid UTF-8) are copied byte for byte. The executable bit is preserved.

Substitution reaches further than the copied files. **Every string in `module.json` / `surface.json`
is substituted too, keys included** — a `postScaffold` note may say `__PRODUCT_SLUG__-analytics`, a
package fragment may carry `"@__SCOPE__/db": "workspace:*"`, a hook command may name the slug — and so
are the contents of **`.env.fragment` and `agents-fragment.md`** before they are merged. A placeholder
`default` may reference a base placeholder or one resolved before it (`"default": "no-reply@__DOMAIN__"`):
values resolve in layer order, base first, so the manifest can store the default literally.

## 2. The rule: never edit a base file

A module cannot change a file base ships — the scaffold would either clobber the base copy or be
clobbered by it, and `--update` could not tell the two apart. Four escape hatches cover every need:

1. **A gen slot** — declare in `module.json`; the scaffold writes the generated file
   (`server.modules`, `server.ports`, `server.rawBodyPaths`, `contracts.handlers`, `web.*`, `mobile.*`, `canaries`).
2. **A merged file** — a fragment the scaffold appends or inserts at a marker
   (`.env.fragment`, `agents-fragment.md`, `packages`, `biome`, `hooks`, `testContractAllow`, `docs`).
3. **A new file** — anything under `files/` at a path base does not own. Routes are new files;
   `routeTree.gen.ts` is rebuilt by `yarn routes:generate`. Guards are new grits wired through `biome`.
4. **`requires`** — when the missing piece belongs to another module (or a surface), depend on it
   instead of duplicating it.

If none fits, the base is missing a slot: add the slot to base and to the engine, never a hack.

## 3. `module.json`

Validated against [`module.schema.json`](module.schema.json) on every scaffold. Every key except `id` is optional.

| key | type | meaning |
|---|---|---|
| `id` | `string` | `^[a-z0-9][a-z0-9-]*$`; equals the directory name |
| `title` | `string` | Human name; used in `.env.example` section headers and `docs/README.md` |
| `summary` | `string` | One line for `docs/README.md` |
| `requires` | `string[]` | Module ids and/or surface names (`web`, `mobile`) that must be selected. Missing → the scaffold fails with the reason; cycles fail |
| `surfaces` | `("web"\|"mobile")[]` | Informational: which surfaces the module ships files for. Gating by surface happens by path regardless |
| `placeholders` | `{ key, question, default? }[]` | Extra `__TOKENS__` the module's files use. `/grill` and `/module` ask `question`; the value lives in `manifest.placeholders[key]`; no value and no default → the scaffold fails |
| `server.modules` | `Ref[]` | → `KIT_MODULES` in `apps/server/src/app.modules.gen.ts` |
| `server.portDefaults` | `{ "<port>": Ref }` | **Declare** a port this layer owns, naming the default provider that stands in until someone claims it — ship that file, the import path is emitted verbatim. Base declares `notification`, `analytics`, `telemetry`; declaring a port another layer already declares → error |
| `server.ports` | `{ "<port>": Ref }` | **Claim** a declared port with a real provider. The port must be declared by some layer — `requires` that module; claiming a port nobody declares → error, two modules claiming one port → error |
| `server.rawBodyPaths` | `string[]` | → `KIT_RAW_BODY_PATHS` (webhook paths that need the raw body) |
| `contracts.handlers` | `Ref[]` | Each symbol is a handler **array**, spread into `KIT_HANDLERS` (`shared/contracts/mocks.gen.ts`) |
| `web.providers` / `web.gates` / `web.boot` | `Ref[]` | → `KIT_PROVIDERS`, `KIT_GATES`, `KIT_BOOT` in `apps/web/src/app/kit.gen.tsx`; one symbol each, in dependency order |
| `web.settingsActions` | `Ref[]` | Each symbol is a `SettingsAction[]`, spread into `KIT_SETTINGS_ACTIONS` |
| `mobile.*` | same four | → `apps/mobile/src/kit.gen.tsx` |
| `packages.<root\|mobile\|tests\|db>` | `{ dependencies?, devDependencies?, scripts?, workspaces?, … }` | Deep-merged into `package.json`, `apps/mobile/package.json`, `tests/package.json`, `db/package.json`. Use `"@versions"` as the version; it resolves from `skeleton/versions.json` (missing → error). Deps are sorted; scripts keep order; any other top-level key (e.g. `msw`) is set only when the file does not already have it. The target file must exist in the tree (ship it, or `requires` the module that does) |
| `biome.plugins` | `string[]` | Appended to `biome.json` `plugins` (deduped) |
| `biome.overrides` | `object[]` | Inserted before the **last** override, which is the server override and must stay last (Biome takes the parser from the last matching override) |
| `canaries` | `{ plugin, fixture, dest, expect: [{ needle, min? }] }[]` | Merged into `scripts/lint-canary/canaries.json`; ship the fixture under `files/scripts/lint-canary/`; `dest` must sit inside the plugin's override scope |
| `hooks` | `{ if?, command, timeout?, statusMessage?, type? }[]` | Appended to `.claude/settings.json` → `hooks.PostToolUse[0].hooks` (`type` defaults to `command`; deduped by `command`); ship the script under `files/.claude/hooks/` |
| `docs` | `"docs/<id>.md"` | Copied from the module dir to the product; a `- [<title>](<id>.md) — <summary>` line is inserted before `<!-- kit:modules -->` in `docs/README.md` |
| `testContractAllow` | `{ path, rule: "unit"\|"e2e", reason }[]` | Concatenated into `scripts/test-contract.allow.json` |
| `postScaffold` | `string[]` | Notes printed after the scaffold and run by `/scaffold` (e.g. "run `yarn db:generate`") |

`Ref` = `{ "import": string, "symbol": string }`. The import path is emitted **verbatim**: server and
contract refs are relative to the gen file (`./auth/auth.module`, `./auth`); web and mobile refs use the
`~/` alias (`~/features/account/session`). A local name in a gen file is unique per
(owner, import path): a symbol that arrives from one place keeps its own name, and when several refs
bring the same symbol the gen file aliases them — by owner when the owners differ
(`handlers as handlers_auth`), then by the import path's last segment when one module brings it from
two of its own files (`handlers` from `./auth` and `./account` → `handlers_auth`, `handlers_account`),
then by index. No two emitted names are ever equal, so export `handlers` from every contract index
without worrying about collisions.

**Declaring a port.** A port is how one layer offers an extension point to another. The declaring
layer owns the interface and the `Symbol` token — base's three live in
`apps/server/src/common/ports/`, a module's own in its feature directory — and names in
`server.portDefaults` the provider that binds that token until someone better comes along: a console
or no-op default, so the port works the day it ships and nothing has to be claimed. Another module
then `requires` the declarer and **claims** the port in `server.ports` with a real provider. Neither
module imports the other: the engine emits exactly one provider per port into `KIT_PORTS`, in
declaration order (base's `notification` · `analytics` · `telemetry` first, then each layer's, in
dependency order), so the gen file stays stable as claims come and go. Declaring a port twice,
claiming one nobody declared, and two claims on one port are all scaffold errors that name the port
and the layers involved. Base's three are claimed this way by `notifications`, `analytics` and
`observability-sentry`; a module wanting its own seam declares one:

```json
{ "id": "search", "server": { "portDefaults": { "search": { "import": "./search/console.provider", "symbol": "SearchConsoleProvider" } } } }
```

and any later module replaces the default without either knowing about the other:

```json
{ "id": "search-meili", "requires": ["search"], "server": { "ports": { "search": { "import": "./search/meili.provider", "symbol": "MeiliSearchProvider" } } } }
```

Example (an auth-shaped module):

```json
{
  "id": "auth-better-auth",
  "title": "Auth (Better Auth)",
  "summary": "email-code sign-in, sessions on both transports, account screen",
  "requires": ["db-prisma"],
  "surfaces": ["web", "mobile"],
  "server": {
    "modules": [{ "import": "./auth/auth.module", "symbol": "AuthModule" }]
  },
  "contracts": { "handlers": [{ "import": "./auth", "symbol": "handlers" }] },
  "web": {
    "providers": [{ "import": "~/features/account/SessionProvider", "symbol": "SessionProvider" }],
    "gates": [{ "import": "~/lib/session", "symbol": "requireSession" }],
    "settingsActions": [{ "import": "~/features/account/settingsActions", "symbol": "settingsActions" }]
  },
  "mobile": {
    "gates": [{ "import": "~/lib/session", "symbol": "useSessionGate" }],
    "settingsActions": [{ "import": "~/features/account/settingsActions", "symbol": "settingsActions" }]
  },
  "packages": {
    "root": { "dependencies": { "better-auth": "@versions", "@better-auth/core": "@versions" } },
    "mobile": { "dependencies": { "@better-auth/expo": "@versions", "expo-secure-store": "@versions" } },
    "db": { "scripts": { "db:seed:auth": "tsx prisma/seed/auth.ts" } }
  },
  "biome": {
    "overrides": [{ "includes": ["apps/web/src/**", "!apps/web/src/data/**"], "plugins": ["biome/client-storage.grit"] }]
  },
  "canaries": [
    { "plugin": "biome/client-storage.grit", "fixture": "client-storage.fixture.ts", "dest": "apps/web/src/features/__lint-canary__/x.ts", "expect": [{ "needle": "client-storage", "min": 1 }] }
  ],
  "docs": "docs/auth-better-auth.md",
  "placeholders": [{ "key": "__AUTH_FROM_EMAIL__", "question": "Which address sends sign-in codes?", "default": "no-reply@__DOMAIN__" }],
  "postScaffold": ["run `yarn db:generate` then `yarn db:migrate`", "set BETTER_AUTH_SECRET in .env"]
}
```

## 4. Gen files and merged files

**Gen files** are rewritten from the manifest on every scaffold and `--update`. Each carries the header
`// GENERATED by paperclip-kit from .paperclip/project.manifest.json — do not edit; run /scaffold --update`.
An edited gen file is skipped on `--update` (reported; `--force-gen` rewrites it).

| file | exports | emitted |
|---|---|---|
| `apps/server/src/app.modules.gen.ts` | `KIT_MODULES: Type[]`, `KIT_PORTS: Provider[]` (exactly one provider per port, in declaration order: base's notification · analytics · telemetry, then every port a layer declares, in dependency order), `KIT_RAW_BODY_PATHS: string[]`; imports `type { Provider, Type }` from `@nestjs/common` | always |
| `shared/contracts/mocks.gen.ts` | `KIT_HANDLERS: RequestHandler[]` (msw) | always |
| `apps/web/src/app/kit.gen.tsx` | `KIT_PROVIDERS`, `KIT_GATES`, `KIT_BOOT`, `KIT_SETTINGS_ACTIONS`; types from `~/app/kit.types` | web selected |
| `apps/mobile/src/kit.gen.tsx` | same four; types from `~/kit.types` | mobile selected |
| `scripts/lint-canary/canaries.json` | a plain JSON array (no header — `check-lint-guards.mjs` iterates it directly): base's seed entries first, then each layer's `canaries` (deduped) | always |

**Merged files** are base content plus every layer's fragments. On a first scaffold they are built from
the kit seed. On `--update`, a merged file the product has edited (or that was ever merged onto a
product-owned file) stays product-owned: the fragments are re-applied **onto the current file**,
idempotently, and the product's edits survive. A merged file nobody touched is rebuilt from the kit seed
so kit updates land. Idempotence keys: `.env.example` section header; package deps/scripts by name;
biome plugins by string and overrides by value; hooks by `command`; allowlist entries by value;
`docs/README.md` by `](<id>.md)`; `AGENTS.md` by its `<!-- kit:module:<id> -->` … `<!-- /kit:module:<id> -->`
block, which is kit-managed and refreshed in place — product rules go outside the block.

## 5. The types a module plugs into (verbatim from ARCHITECTURE.md §4; they live in base)

- web `Gate = (ctx: { queryClient: QueryClient; location: ParsedLocation }) => Promise<Record<string, unknown> | void>`;
  `_app.tsx` runs `KIT_GATES` in order in `beforeLoad`, merging returned context (a gate throws `redirect`). Modules
  augment the router context type via `declare module` in their own files.
- mobile `Gate = () => { ready: boolean; allow: boolean; redirectTo?: Href }` (a hook); `app/_layout.tsx` calls
  each in `useAppGates()` and renders `Stack.Protected guard={allow}`; `index.tsx` redirects to the first `redirectTo`.
- `SettingsAction = { id: string; label: string; run: () => Promise<void> | void; tone?: "default" | "danger" }`.
- `Provider = React.ComponentType<{ children: React.ReactNode }>`; `Boot = () => Promise<void> | void` (run once before mount).

Server ports (`common/ports/{notification,analytics,telemetry}.ts`) are interfaces + `Symbol` tokens with
console/noop defaults; a module claims one by exporting a Nest `Provider` for that token. A module
that declares a port of its own (§3) ships the same three pieces under its own feature directory.

## 5b. Conventions the rails assume

These conventions are not enforced by a slot, so they are stated here and checked in review.

- **Copy.** A module ships its own copy module, `shared/domain/<feature>/copy.ts`, and imports it
  directly — `import { ACCOUNT_COPY } from "@domain/account/copy"`. The barrel `shared/domain/copy.ts`
  (`@domain/copy`) is a base file that re-exports **base's sections only** (`EXAMPLE_COPY`,
  `SETTINGS_COPY`, `SHELL_COPY`, `fill`); a module never adds a line to it (rule §2) and never expects
  its own copy to be reachable through it. Base copy stays readable through the barrel from a module
  (`SHELL_COPY.error.retry`). `/feature` — product code, not a module — is the one thing that adds a
  barrel line.
- **Contracts.** An app imports the endpoint module it calls — `@contracts/example/list-items`,
  `@contracts/example/item`, `@contracts/example/get-item.mock` in a spec — **never a feature's
  `index.ts`**. The feature barrel exports `handlers` (msw) and exists for `mocks.ts` and
  `contracts.handlers`; a screen importing it pulls msw into the app bundle. The same holds for a
  module's own contracts under `shared/contracts/<id>/`.
- **`console.*` on the server.** With the `telemetry` module on, `no-console-in-domain.grit` errors on
  `console.*` under `apps/server/src/**`. The exemptions are **by file name**, not by module, so a module
  needs no override of its own: a console adapter is named `console.adapter.ts`
  (`<feature>/providers/[<channel>/]console.adapter.ts` — analytics and notifications do this), a REPL
  sample `*.repl.ts` (llm's `example.repl.ts`); `main.ts`, `telemetry/**`, `common/ports/**` and specs
  are exempt as well. A module that legitimately prints (a fake provider, a dev tool) uses those names.
- **A pathless layout ships at least one child route.** A layout route whose segment is only an
  underscore (`_app/_paid.tsx`) exists to wrap children, so a module that ships one ships a route
  under it. With none, `yarn routes:generate` collapses the layout to `/`, where it collides with
  base's `routes/index.tsx` and fails the run with *Conflicting configuration paths* — a message
  that names the collision and never the empty layout behind it. `payments-stripe` ships
  `_app/_paid/subscription.tsx` for exactly this reason.
- **A port provider may inject a global token.** `payments-stripe`'s
  `SubscriptionAuthExtensionsProvider` binds `AUTH_EXTENSIONS` with `inject: [PRISMA]`, which
  resolves only because the real `AppModule` imports `db-prisma`'s `@Global() DatabaseModule`.
  Nothing may assume port providers are dependency-free, and no spec may compile the real
  `KIT_PORTS` or `KIT_MODULES` into an isolated testing module: it fails to resolve
  (`Nest can't resolve … Symbol(PRISMA) … in the PortsModule module`) on every tree that selected
  such a module and on no other, so the spec is green wherever it was written. A spec builds its
  ports from its own fixtures instead — `common/ports/ports.module.spec.ts` and
  `common/request-pipeline.integration.spec.ts` both do; reading a generated list without
  instantiating it (pinning `PortsModule`'s exports metadata to `KIT_PORTS`) is the one safe use.
- **A spec asserts its own contribution, never a total.** Settings action rows, ports, msw handlers,
  server modules: every list a module contributes to grows when the next module is selected, so
  `toHaveLength(3)` or a whole-array `toEqual([…])` over one of them passes on the module's own row
  and fails the `all` row. Assert that the entry this module adds is present (`arrayContaining`, a
  `find`) and let the length be whatever the manifest made it.

## 6. Every module passes the gates alone

A module must be green on every gate scaffolded **alone on top of base** (plus its `requires`, with
both surfaces), and **together with every other module**. That is the integration matrix
(`ARCHITECTURE.md` §7 W3, results in §8); a module that only works next to another one has an
undeclared `requires`. The exact matrix, one scratch tree per row:

| row | manifest `surfaces` | manifest `modules` |
|---|---|---|
| base | `[]` | `[]` |
| base + web | `["web"]` | `[]` |
| base + web + mobile | `["web", "mobile"]` | `[]` |
| `<id>` alone | `["web", "mobile"]` | `["<id>", …its transitive requires]` |
| all | `["web", "mobile"]` | every id under `skeleton/modules/` |

and the commands per row, in this order, each green before the next:

```bash
bash bin/scaffold.sh --manifest <row>.json --out <scratch>/<row>   # --dry-run first when in doubt
cd <scratch>/<row>                                                  # node 22.17.1 (volta reads the pin; nvm use 22.17.1)
HUSKY=0 yarn install                                                # no .git yet: skip the hook install
yarn routes:generate                                                # rows with web
yarn db:generate                                                    # rows with db-prisma (needs no database)
yarn typecheck && yarn lint && yarn lint:guards && yarn test && yarn test:contract
yarn test:e2e:validate && yarn test:e2e                             # rows with web; Chromium once: yarn --cwd tests playwright:install
```

A module whose real path needs infrastructure (db-prisma's Postgres, a webhook) proves it once by hand —
`docker compose -f docker-compose.db.yml up -d`, `yarn db:migrate --name init`, `yarn dev`, one real-mode
call — and says so in its PR; the gates stay hermetic.

## 7. Checklist for a new module

1. `skeleton/modules/<id>/module.json` with `id`, `title`, `summary`, `requires`, `surfaces`.
2. Code under `files/` at paths base does not own; `.env.fragment` for every env key, with a comment per key; `agents-fragment.md` only for rules that must hold on every edit (a procedure is a skill, an explanation is `docs/<id>.md`).
3. Wire through slots, not edits: server module → `server.modules`; a port implementation → `server.ports`; contract handlers → `contracts.handlers`; web/mobile providers, gates, boot, settings actions → `web.*` / `mobile.*`; webhooks → `server.rawBodyPaths`.
4. Dependencies as `"@versions"` in `packages.*`; add any new package to `skeleton/versions.json` first.
5. Every guard ships a grit under `files/biome/`, an override or plugin entry under `biome`, a fixture under `files/scripts/lint-canary/` and a `canaries` entry — a guard without a canary is a dead guard.
6. Screens get spec siblings and (web) contract e2e specs; controllers and services get spec siblings; exceptions go in `testContractAllow` with a reviewable reason.
7. `docs/<id>.md` in the present tense: what it adds, the env keys, how a feature uses it, how to swap the provider.
8. `postScaffold` notes for anything a script cannot do (generate a client, run a migration, fill a secret).
9. Run the §6 matrix for the new module's row and the `all` row (`--dry-run` first); run `node --test bin/lib/*.test.mjs` if you touched the engine.
