// node --test bin/lib/
// Exercises the scaffold engine against a synthetic mini-kit built in a temp dir (never the real skeleton,
// which other agents build in parallel). Only the real docs/*.schema.json files are borrowed from the kit.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { formatJson, GEN_HEADER, LOCK_PATH, printReport, ScaffoldError, scaffold, validateSchema } from "./scaffold.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_KIT = path.resolve(HERE, "../..");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-kit-test-"));
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
let counter = 0;
const fresh = (name) => {
  const d = path.join(tmpRoot, `${name}-${++counter}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

/** Writes { "rel/path": string | Buffer | object } under root. */
function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const data = Buffer.isBuffer(content) || typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
    fs.writeFileSync(abs, data);
  }
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const readJson = (root, rel) => JSON.parse(read(root, rel));
const has = (root, rel) => fs.existsSync(path.join(root, rel));

// ───────────── the mini-kit ─────────────

function buildMiniKit() {
  const kit = fresh("kit");
  writeTree(kit, {
    VERSION: "0.2.0\n",
    "docs/manifest.schema.json": fs.readFileSync(path.join(REAL_KIT, "docs/manifest.schema.json")),
    "docs/module.schema.json": fs.readFileSync(path.join(REAL_KIT, "docs/module.schema.json")),
    "skeleton/versions.json": {
      packages: { zod: "^4.3.6", msw: "^2.15.0", "@nestjs/common": "^11.0.0", "@playwright/test": "^1.60.0", vite: "^6.0.0" },
    },
    // ── base
    "skeleton/base/package.json": {
      name: "__PRODUCT_SLUG__",
      private: true,
      workspaces: ["tests"],
      scripts: { dev: "concurrently", typecheck: "tsc" },
      dependencies: { zod: "@versions" },
      devDependencies: {},
    },
    "skeleton/base/.env.example": "NODE_ENV=development\nPORT=3000\n",
    "skeleton/base/biome.json": {
      plugins: ["biome/base.grit"],
      overrides: [
        { includes: ["apps/*/src/features/**/hooks/**"], plugins: ["biome/hook-narrow-return.grit"] },
        { includes: ["apps/server/**"], javascript: { parser: { unsafeParameterDecoratorsEnabled: true } } },
      ],
    },
    "skeleton/base/.claude/settings.json": {
      hooks: { PostToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: "base-guard.sh", timeout: 15 }] }] },
    },
    "skeleton/base/scripts/test-contract.allow.json": [{ path: "apps/web/src/features/shell/screens/Home.tsx", rule: "e2e", reason: "placeholder" }],
    "skeleton/base/scripts/lint-canary/canaries.json": [{ plugin: "biome/base.grit", fixture: "base.fixture.ts", dest: "apps/server/src/__lint-canary__/x.ts", expect: [{ needle: "base", min: 1 }] }],
    "skeleton/base/docs/README.md": "# Docs\n\n- [architecture](architecture.md) — the shape\n<!-- kit:modules -->\n\nTrailing.\n",
    "skeleton/base/AGENTS.md": "# __PRODUCT_NAME__\n\n## Hard rules\n\n- no git writes\n\n<!-- kit:module-rules -->\n\n## Conventions\n",
    "skeleton/base/apps/server/src/app.module.ts": 'import { KIT_MODULES } from "./app.modules.gen";\n// __PRODUCT_SLUG__ __COOKIE_PREFIX__ __DB_NAME__ __BUNDLE_ID__ __SCHEME__ __DOMAIN__ __TRUNK__ __SCOPE__\n',
    "skeleton/base/apps/server/src/shared.ts": "export const from = 'base';\n",
    "skeleton/base/assets/logo.png": Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]), Buffer.from("__PRODUCT_SLUG__")]),
    "skeleton/base/scripts/run.sh": "#!/usr/bin/env bash\necho __PRODUCT_SLUG__\n",
    "skeleton/base/__PRODUCT_SLUG__.txt": "file names are never substituted\n",
    "skeleton/base/.spec/README.md": "plans\n",
    // ── surface: web (files at the layer root + a module.json for its contributions)
    "skeleton/surfaces/web/surface.json": {
      id: "web",
      title: "Web",
      packages: { root: { scripts: { "dev:client": "vite", "routes:generate": "tsr generate" }, devDependencies: { vite: "@versions" }, msw: { workerDirectory: ["apps/web/public"] } } },
      canaries: [{ plugin: "biome/web.grit", fixture: "web.fixture.ts", dest: "apps/web/src/__lint-canary__/x.ts", expect: [{ needle: "web", min: 1 }] }],
      postScaffold: ["run `yarn --cwd tests playwright:install` once per machine"],
    },
    "skeleton/surfaces/web/.env.fragment": "VITE_API_MODE=real\n",
    "skeleton/surfaces/web/apps/web/src/app/App.tsx": "export const title = '__PRODUCT_NAME__';\n",
    // seeded by the kit, then rewritten in place by msw's postinstall — a vendor file, not a product edit
    "skeleton/surfaces/web/apps/web/public/mockServiceWorker.js": "/* msw worker — kit seed */\n",
    "skeleton/surfaces/web/tests/package.json": { name: "@__SCOPE__/e2e", devDependencies: { "@playwright/test": "@versions" } },
    // ── surface: mobile (rides on web, like the real one; used by the both-surfaces and requires tests)
    "skeleton/surfaces/mobile/surface.json": { id: "mobile", title: "Mobile", requires: ["web"] },
    "skeleton/surfaces/mobile/apps/mobile/src/App.tsx": "export const scheme = '__SCHEME__';\n",
    "skeleton/surfaces/mobile/apps/mobile/package.json": { name: "__PRODUCT_SLUG__-mobile", dependencies: {} },
    // ── module: alpha
    "skeleton/modules/alpha/module.json": {
      id: "alpha",
      title: "Alpha",
      summary: "the first module",
      requires: [],
      surfaces: ["web", "mobile"],
      server: {
        modules: [{ import: "./alpha/alpha.module", symbol: "AlphaModule" }],
        ports: { notification: { import: "./alpha/notification.provider", symbol: "AlphaNotificationProvider" } },
        rawBodyPaths: ["/api/alpha/webhook"],
      },
      contracts: { handlers: [{ import: "./alpha", symbol: "handlers" }] },
      web: {
        providers: [{ import: "~/features/alpha/AlphaProvider", symbol: "AlphaProvider" }],
        gates: [{ import: "~/features/alpha/gate", symbol: "requireAlpha" }],
        boot: [{ import: "~/lib/alpha", symbol: "bootAlpha" }],
        settingsActions: [{ import: "~/features/alpha/settings", symbol: "settingsActions" }],
      },
      mobile: { gates: [{ import: "~/features/alpha/gate", symbol: "useAlphaGate" }] },
      packages: {
        root: { dependencies: { msw: "@versions", "@nestjs/common": "@versions" }, scripts: { "alpha:seed": "tsx scripts/alpha-seed.ts" } },
        tests: { devDependencies: { zod: "@versions" } },
      },
      biome: { plugins: ["biome/alpha.grit"], overrides: [{ includes: ["apps/server/src/alpha/**"], plugins: ["biome/alpha-scope.grit"] }] },
      canaries: [{ plugin: "biome/alpha.grit", fixture: "alpha.fixture.ts", dest: "apps/server/src/alpha/__lint-canary__/x.ts", expect: [{ needle: "alpha", min: 2 }] }],
      hooks: [{ if: "Edit(apps/**)", command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/alpha-reminder.sh', timeout: 15, statusMessage: "alpha" }],
      docs: "docs/alpha.md",
      testContractAllow: [{ path: "apps/web/src/features/alpha/screens/Alpha.tsx", rule: "unit", reason: "covered by conformance" }],
      postScaffold: ["run `yarn alpha:seed`"],
    },
    "skeleton/modules/alpha/docs/alpha.md": "# Alpha for __PRODUCT_NAME__\n",
    "skeleton/modules/alpha/files/.env.fragment": "ALPHA_KEY=\nALPHA_MODE=fake\n",
    "skeleton/modules/alpha/files/agents-fragment.md": "- Alpha rule: never call alpha directly.\n",
    "skeleton/modules/alpha/files/apps/server/src/alpha/alpha.module.ts": "export class AlphaModule {}\n",
    "skeleton/modules/alpha/files/apps/server/src/shared.ts": "export const from = 'alpha';\n",
    "skeleton/modules/alpha/files/apps/web/src/features/alpha/gate.ts": "export const requireAlpha = () => {};\n",
    "skeleton/modules/alpha/files/apps/mobile/src/features/alpha/gate.ts": "export const useAlphaGate = () => {};\n",
    "skeleton/modules/alpha/files/tests/specs/web/contract/alpha/alpha.spec.ts": "// __PRODUCT_SLUG__ e2e\n",
    "skeleton/modules/alpha/files/scripts/lint-canary/alpha.fixture.ts": "alpha alpha\n",
    "skeleton/modules/alpha/files/.claude/hooks/alpha-reminder.sh": "#!/usr/bin/env bash\nexit 0\n",
    // ── module: beta (requires alpha; overlays alpha's shared.ts)
    "skeleton/modules/beta/module.json": {
      id: "beta",
      title: "Beta",
      summary: "depends on alpha",
      requires: ["alpha"],
      server: { modules: [{ import: "./beta/beta.module", symbol: "BetaModule" }], ports: { analytics: { import: "./beta/analytics.provider", symbol: "BetaAnalyticsProvider" } } },
      contracts: { handlers: [{ import: "./beta", symbol: "handlers" }] },
      web: { settingsActions: [{ import: "~/features/beta/settings", symbol: "settingsActions" }] },
      packages: { root: { dependencies: { zod: "@versions" } } },
      placeholders: [{ key: "__BETA_REGION__", question: "Which region does beta run in?", default: "eu" }],
      docs: "docs/beta.md",
    },
    "skeleton/modules/beta/docs/beta.md": "# Beta in __BETA_REGION__\n",
    "skeleton/modules/beta/files/apps/server/src/beta/beta.module.ts": "export class BetaModule {} // region __BETA_REGION__\n",
    "skeleton/modules/beta/files/apps/server/src/shared.ts": "export const from = 'beta';\n",
    "skeleton/modules/beta/files/agents-fragment.md": "- Beta rule v1.\n",
    // ── modules used only by error tests
    "skeleton/modules/needs-mobile/module.json": { id: "needs-mobile", title: "Needs mobile", requires: ["mobile"] },
    "skeleton/modules/needs-missing/module.json": { id: "needs-missing", title: "Needs missing", requires: ["nope"] },
    "skeleton/modules/cyc-a/module.json": { id: "cyc-a", title: "A", requires: ["cyc-b"] },
    "skeleton/modules/cyc-b/module.json": { id: "cyc-b", title: "B", requires: ["cyc-a"] },
    "skeleton/modules/badver/module.json": { id: "badver", title: "Bad version", packages: { root: { dependencies: { "left-pad": "@versions" } } } },
    "skeleton/modules/needs-placeholder/module.json": { id: "needs-placeholder", title: "P", placeholders: [{ key: "__SECRET_NAME__", question: "Name?" }] },
    "skeleton/modules/port-clash/module.json": { id: "port-clash", title: "Clash", server: { ports: { notification: { import: "./x", symbol: "X" } } } },
    // ── module: dual (one module contributing the same symbol from two of its own paths, in four slots)
    "skeleton/modules/dual/module.json": {
      id: "dual",
      title: "Dual",
      contracts: {
        handlers: [
          { import: "./dual/auth", symbol: "handlers" },
          { import: "./dual/account", symbol: "handlers" },
        ],
      },
      web: {
        // the third provider is literally the alias the first two want: no emitted name may collide
        providers: [
          { import: "~/features/dual/one", symbol: "Widget" },
          { import: "~/features/dual/two", symbol: "Widget" },
          { import: "~/features/dual/three", symbol: "Widget_one" },
        ],
        gates: [
          { import: "~/features/dual/session", symbol: "guard" },
          { import: "~/features/dual/access", symbol: "guard" },
        ],
        // same last segment on both paths: only the index can tell them apart
        boot: [
          { import: "~/lib/x/session", symbol: "warm" },
          { import: "~/lib/y/session", symbol: "warm" },
        ],
      },
    },
    // ── modules that declare and claim ports
    "skeleton/modules/port-host/module.json": {
      id: "port-host",
      title: "Port host",
      server: {
        portDefaults: {
          search: { import: "./search/console.provider", symbol: "SearchConsoleProvider" },
          queue: { import: "./queue/console.provider", symbol: "QueueConsoleProvider" },
        },
      },
    },
    "skeleton/modules/port-user/module.json": {
      id: "port-user",
      title: "Port user",
      requires: ["port-host"],
      server: { ports: { search: { import: "./search/meili.provider", symbol: "MeiliSearchProvider" } } },
    },
    "skeleton/modules/port-host-alt/module.json": {
      id: "port-host-alt",
      title: "Port host (alt)",
      server: { portDefaults: { search: { import: "./search/other.provider", symbol: "OtherSearchProvider" } } },
    },
    "skeleton/modules/port-shadow/module.json": {
      id: "port-shadow",
      title: "Port shadow",
      server: { portDefaults: { analytics: { import: "./shadow/analytics.provider", symbol: "ShadowAnalyticsProvider" } } },
    },
    "skeleton/modules/port-ghost/module.json": {
      id: "port-ghost",
      title: "Port ghost",
      server: { ports: { ghost: { import: "./ghost/ghost.provider", symbol: "GhostProvider" } } },
    },
    // ── engineering layer
    "engineering/agents/platform-engineer.md": "---\nname: platform-engineer\n---\nrails for __PRODUCT_NAME__\n",
    "engineering/commands/grill.md": "---\ndescription: interview\n---\n",
    "engineering/skills/guardrails/SKILL.md": "# guardrails\n",
    "engineering/skills/guardrails/reference/tiers.md": "tiers\n",
  });
  for (const rel of ["skeleton/base/scripts/run.sh", "skeleton/modules/alpha/files/.claude/hooks/alpha-reminder.sh"]) fs.chmodSync(path.join(kit, rel), 0o755);
  return kit;
}

const manifestFor = (overrides = {}) => ({
  product: { slug: "acme-notes", name: "Acme Notes", scope: "acme" },
  surfaces: ["web"],
  modules: ["beta", "alpha"], // deliberately out of dependency order
  answers: { product: "notes" },
  kit: { version: "0.2.0" },
  ...overrides,
});

function writeManifest(dir, manifest) {
  const p = path.join(dir, ".paperclip/project.manifest.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(manifest, null, 2)}\n`);
  return p;
}

function run(kit, out, manifest, opts = {}) {
  const manifestPath = writeManifest(out, manifest);
  return scaffold({ manifestPath, outDir: out, kitDir: kit, ...opts });
}

const WRITES = ["add", "update", "regenerate", "merge", "overwrite"];
const expectFail = (fn, re) => assert.throws(fn, (e) => e instanceof ScaffoldError && re.test(e.message), `expected error matching ${re}`);

// ───────────── tests ─────────────

describe("first scaffold", () => {
  let kit;
  let out;
  let result;
  before(() => {
    kit = buildMiniKit();
    out = fresh("out");
    result = run(kit, out, manifestFor());
  });

  it("orders modules by requires and copies base → surfaces → modules", () => {
    assert.deepEqual(result.layers.map((l) => l.id), ["base", "web", "alpha", "beta"]);
    assert.equal(read(out, "apps/server/src/shared.ts"), "export const from = 'beta';\n", "later layer overlays earlier");
    assert.ok(has(out, "apps/server/src/alpha/alpha.module.ts"));
    assert.ok(has(out, "apps/web/src/app/App.tsx"));
    assert.ok(has(out, ".spec/README.md"));
  });

  it("substitutes placeholders in text files only, with defaults", () => {
    assert.equal(
      read(out, "apps/server/src/app.module.ts"),
      'import { KIT_MODULES } from "./app.modules.gen";\n// acme-notes acme-notes acme_notes com.acme.acmenotes acme-notes acme-notes.example.com development acme\n'
    );
    assert.equal(read(out, "apps/web/src/app/App.tsx"), "export const title = 'Acme Notes';\n");
    const png = fs.readFileSync(path.join(out, "assets/logo.png"));
    assert.ok(png.includes("__PRODUCT_SLUG__"), "binary content untouched");
    assert.ok(has(out, "__PRODUCT_SLUG__.txt"), "file names untouched");
    assert.equal(read(out, "apps/server/src/beta/beta.module.ts"), "export class BetaModule {} // region eu\n", "module placeholder default");
    assert.equal(read(out, "docs/beta.md"), "# Beta in eu\n");
  });

  it("preserves the executable bit", () => {
    assert.ok(fs.statSync(path.join(out, "scripts/run.sh")).mode & 0o100);
    assert.ok(fs.statSync(path.join(out, ".claude/hooks/alpha-reminder.sh")).mode & 0o100);
  });

  it("gates module files by surface and never copies fragments", () => {
    assert.ok(has(out, "apps/web/src/features/alpha/gate.ts"), "web files copied when web selected");
    assert.ok(!has(out, "apps/mobile/src/features/alpha/gate.ts"), "mobile files skipped when mobile not selected");
    assert.ok(has(out, "tests/specs/web/contract/alpha/alpha.spec.ts"), "tests files ride with web");
    assert.ok(!has(out, ".env.fragment"));
    assert.ok(!has(out, "agents-fragment.md"));
    assert.ok(!has(out, "module.json") && !has(out, "surface.json"), "the layer's own manifest (module.json / surface.json) is consumed, not copied");
  });

  it("writes app.modules.gen.ts with modules, one provider per port, raw-body paths", () => {
    const text = read(out, "apps/server/src/app.modules.gen.ts");
    assert.equal(
      text,
      [
        GEN_HEADER,
        'import type { Provider, Type } from "@nestjs/common";',
        'import { AlphaModule } from "./alpha/alpha.module";',
        'import { AlphaNotificationProvider } from "./alpha/notification.provider";',
        'import { BetaAnalyticsProvider } from "./beta/analytics.provider";',
        'import { BetaModule } from "./beta/beta.module";',
        'import { TelemetryConsoleProvider } from "./common/ports/telemetry";',
        "",
        "export const KIT_MODULES: Type[] = [AlphaModule, BetaModule];",
        "export const KIT_PORTS: Provider[] = [AlphaNotificationProvider, BetaAnalyticsProvider, TelemetryConsoleProvider];",
        'export const KIT_RAW_BODY_PATHS: string[] = ["/api/alpha/webhook"];',
        "",
      ].join("\n")
    );
  });

  it("writes mocks.gen.ts, aliasing colliding symbols", () => {
    const text = read(out, "shared/contracts/mocks.gen.ts");
    assert.ok(text.startsWith(GEN_HEADER));
    assert.ok(text.includes('import type { RequestHandler } from "msw";'));
    assert.ok(text.includes('import { handlers as handlers_alpha } from "./alpha";'));
    assert.ok(text.includes('import { handlers as handlers_beta } from "./beta";'));
    assert.ok(text.includes("export const KIT_HANDLERS: RequestHandler[] = [...handlers_alpha, ...handlers_beta];"));
  });

  it("writes kit.gen.tsx for the selected surface only", () => {
    const text = read(out, "apps/web/src/app/kit.gen.tsx");
    assert.ok(text.includes('import type { Boot, Gate, Provider, SettingsAction } from "~/app/kit.types";'));
    assert.ok(text.includes("export const KIT_PROVIDERS: Provider[] = [AlphaProvider];"));
    assert.ok(text.includes("export const KIT_GATES: Gate[] = [requireAlpha];"));
    assert.ok(text.includes("export const KIT_BOOT: Boot[] = [bootAlpha];"));
    assert.ok(text.includes("export const KIT_SETTINGS_ACTIONS: SettingsAction[] = [...settingsActions_alpha, ...settingsActions_beta];"));
    assert.ok(!has(out, "apps/mobile/src/kit.gen.tsx"));
  });

  it("merges canaries.json from the base seed plus every layer", () => {
    const json = readJson(out, "scripts/lint-canary/canaries.json");
    assert.ok(Array.isArray(json), "a plain array: check-lint-guards.mjs iterates it directly");
    assert.deepEqual(json.map((c) => c.plugin), ["biome/base.grit", "biome/web.grit", "biome/alpha.grit"]);
    assert.ok(has(out, "scripts/lint-canary/alpha.fixture.ts"));
  });

  it("merges .env.example with one titled section per fragment", () => {
    assert.equal(
      read(out, ".env.example"),
      "NODE_ENV=development\nPORT=3000\n\n# --- web: Web ---\nVITE_API_MODE=real\n\n# --- alpha: Alpha ---\nALPHA_KEY=\nALPHA_MODE=fake\n"
    );
  });

  it("merges package.json targets, resolves @versions and sorts deps", () => {
    const root = readJson(out, "package.json");
    assert.equal(root.name, "acme-notes");
    assert.deepEqual(root.dependencies, { "@nestjs/common": "^11.0.0", msw: "^2.15.0", zod: "^4.3.6" });
    assert.deepEqual(Object.keys(root.dependencies), ["@nestjs/common", "msw", "zod"]);
    assert.deepEqual(root.devDependencies, { vite: "^6.0.0" });
    assert.deepEqual(root.scripts, { dev: "concurrently", typecheck: "tsc", "dev:client": "vite", "routes:generate": "tsr generate", "alpha:seed": "tsx scripts/alpha-seed.ts" });
    assert.deepEqual(root.workspaces, ["tests"]);
    assert.deepEqual(root.msw, { workerDirectory: ["apps/web/public"] }, "an extra top-level key lands when the seed lacks it");
    const tests = readJson(out, "tests/package.json");
    assert.equal(tests.name, "@acme/e2e");
    assert.deepEqual(tests.devDependencies, { "@playwright/test": "^1.60.0", zod: "^4.3.6" });
    assert.ok(!has(out, "apps/mobile/package.json"));
    assert.ok(!has(out, "db/package.json"));
  });

  it("merges biome.json: plugins appended, overrides inserted before the server override", () => {
    const biome = readJson(out, "biome.json");
    assert.deepEqual(biome.plugins, ["biome/base.grit", "biome/alpha.grit"]);
    assert.deepEqual(biome.overrides.map((o) => o.includes[0]), ["apps/*/src/features/**/hooks/**", "apps/server/src/alpha/**", "apps/server/**"]);
  });

  it("merges .claude/settings.json hooks and the allowlist", () => {
    const settings = readJson(out, ".claude/settings.json");
    const hooks = settings.hooks.PostToolUse[0].hooks;
    assert.equal(hooks.length, 2);
    assert.deepEqual(hooks[1], { type: "command", if: "Edit(apps/**)", command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/alpha-reminder.sh', timeout: 15, statusMessage: "alpha" });
    const allow = readJson(out, "scripts/test-contract.allow.json");
    assert.equal(allow.length, 2);
    assert.equal(allow[1].rule, "unit");
  });

  it("merges docs/README.md and AGENTS.md at their markers", () => {
    assert.equal(
      read(out, "docs/README.md"),
      "# Docs\n\n- [architecture](architecture.md) — the shape\n- [Alpha](alpha.md) — the first module\n- [Beta](beta.md) — depends on alpha\n<!-- kit:modules -->\n\nTrailing.\n"
    );
    assert.equal(read(out, "docs/alpha.md"), "# Alpha for Acme Notes\n");
    assert.equal(
      read(out, "AGENTS.md"),
      "# Acme Notes\n\n## Hard rules\n\n- no git writes\n\n<!-- kit:module:alpha -->\n- Alpha rule: never call alpha directly.\n<!-- /kit:module:alpha -->\n<!-- kit:module:beta -->\n- Beta rule v1.\n<!-- /kit:module:beta -->\n<!-- kit:module-rules -->\n\n## Conventions\n"
    );
  });

  it("copies the engineering layer into .agents with relative .claude symlinks, and CLAUDE.md → AGENTS.md", () => {
    assert.equal(read(out, ".agents/agents/platform-engineer.md"), "---\nname: platform-engineer\n---\nrails for Acme Notes\n");
    assert.ok(has(out, ".agents/skills/guardrails/reference/tiers.md"));
    assert.equal(fs.readlinkSync(path.join(out, ".claude/agents/platform-engineer.md")), "../../.agents/agents/platform-engineer.md");
    assert.equal(fs.readlinkSync(path.join(out, ".claude/skills/guardrails")), "../../.agents/skills/guardrails");
    assert.equal(fs.readFileSync(path.join(out, ".claude/commands/grill.md"), "utf8"), "---\ndescription: interview\n---\n", "symlink resolves");
    assert.equal(fs.readlinkSync(path.join(out, "CLAUDE.md")), "AGENTS.md");
  });

  it("writes the ledger with hashes for every kit-written path", () => {
    const lock = readJson(out, LOCK_PATH);
    assert.equal(lock.kitVersion, "0.2.0");
    assert.deepEqual(lock.modules, ["alpha", "beta"]);
    assert.deepEqual(lock.surfaces, ["web"]);
    assert.equal(lock.files["package.json"].kind, "merge");
    assert.equal(lock.files["apps/server/src/app.modules.gen.ts"].kind, "gen");
    assert.equal(lock.files["apps/server/src/shared.ts"].source, "beta");
    assert.equal(lock.files[".agents/agents/platform-engineer.md"].kind, "engineering");
    assert.ok(!lock.files[".paperclip/project.manifest.json"], "the manifest is product-owned");
    assert.ok(!lock.files["CLAUDE.md"], "symlinks are not hashed");
    assert.match(lock.files["package.json"].hash, /^sha256:[0-9a-f]{64}$/);
  });

  it("reports a checklist with install, routes, post-scaffold notes and the gates", () => {
    assert.deepEqual(result.checklist, [
      "HUSKY=0 yarn install",
      "yarn routes:generate",
      "[web] run `yarn --cwd tests playwright:install` once per machine",
      "[alpha] run `yarn alpha:seed`",
      "gates: yarn typecheck · yarn lint · yarn lint:guards · yarn test · yarn test:contract · yarn test:e2e:validate · yarn test:e2e",
    ]);
    assert.equal(result.summary.add, result.actions.length, "everything is added on a first scaffold");
  });

  it("is deterministic: a second scaffold of the same manifest yields byte-identical files", () => {
    const out2 = fresh("out-again");
    run(kit, out2, manifestFor());
    const list = (root) => fs.readdirSync(root, { recursive: true }).filter((r) => !r.endsWith(LOCK_PATH)).sort();
    assert.deepEqual(list(out2), list(out));
    for (const rel of list(out)) {
      const a = path.join(out, rel);
      if (!fs.lstatSync(a).isFile()) continue;
      assert.ok(fs.readFileSync(a).equals(fs.readFileSync(path.join(out2, rel))), `${rel} differs`);
    }
  });

  it("refuses a second first-scaffold on a locked tree", () => {
    expectFail(() => run(kit, out, manifestFor()), /already scaffolded.*--update/);
  });
});

describe("both surfaces", () => {
  it("emits the mobile gen file, mobile files and the mobile package.json", () => {
    const kit = buildMiniKit();
    const out = fresh("out-mobile");
    run(kit, out, manifestFor({ surfaces: ["mobile", "web"] }));
    const text = read(out, "apps/mobile/src/kit.gen.tsx");
    assert.ok(text.includes('from "~/kit.types"'));
    assert.ok(text.includes("export const KIT_GATES: Gate[] = [useAlphaGate];"));
    assert.ok(text.includes("export const KIT_SETTINGS_ACTIONS: SettingsAction[] = [];"));
    assert.ok(has(out, "apps/mobile/src/features/alpha/gate.ts"));
    assert.equal(read(out, "apps/mobile/src/App.tsx"), "export const scheme = 'acme-notes';\n");
    assert.equal(readJson(out, "apps/mobile/package.json").name, "acme-notes-mobile");
    assert.deepEqual(readJson(out, LOCK_PATH).surfaces, ["web", "mobile"], "canonical surface order");
  });

  it("uses the base console provider for every unclaimed port", () => {
    const kit = buildMiniKit();
    const out = fresh("out-none");
    run(kit, out, manifestFor({ modules: [] }));
    const text = read(out, "apps/server/src/app.modules.gen.ts");
    assert.ok(text.includes("export const KIT_MODULES: Type[] = [];"));
    assert.ok(text.includes("export const KIT_PORTS: Provider[] = [NotificationConsoleProvider, AnalyticsConsoleProvider, TelemetryConsoleProvider];"));
    assert.ok(text.includes('import { AnalyticsConsoleProvider } from "./common/ports/analytics";'));
    assert.ok(read(out, "shared/contracts/mocks.gen.ts").includes("export const KIT_HANDLERS: RequestHandler[] = [];"));
    assert.equal(read(out, ".env.example"), "NODE_ENV=development\nPORT=3000\n\n# --- web: Web ---\nVITE_API_MODE=real\n");
  });
});

describe("alias uniqueness", () => {
  let out;
  before(() => {
    out = fresh("out-alias");
    run(buildMiniKit(), out, manifestFor({ modules: ["beta", "alpha", "dual"] }));
  });

  it("aliases one owner's two paths by segment, and across owners by owner", () => {
    const text = read(out, "shared/contracts/mocks.gen.ts");
    assert.ok(text.includes('import { handlers as handlers_alpha } from "./alpha";'));
    assert.ok(text.includes('import { handlers as handlers_beta } from "./beta";'));
    assert.ok(text.includes('import { handlers as handlers_dual_auth } from "./dual/auth";'));
    assert.ok(text.includes('import { handlers as handlers_dual_account } from "./dual/account";'));
    assert.ok(
      text.includes("export const KIT_HANDLERS: RequestHandler[] = [...handlers_alpha, ...handlers_beta, ...handlers_dual_auth, ...handlers_dual_account];")
    );
  });

  it("never emits one local name twice, whatever the manifests say", () => {
    const text = read(out, "apps/web/src/app/kit.gen.tsx");
    // Widget_one is taken by a real export, so the alias for ~/features/dual/one steps aside
    assert.ok(text.includes('import { Widget as Widget_one_2 } from "~/features/dual/one";'));
    assert.ok(text.includes('import { Widget as Widget_two } from "~/features/dual/two";'));
    assert.ok(text.includes('import { Widget_one } from "~/features/dual/three";'));
    assert.ok(text.includes("export const KIT_PROVIDERS: Provider[] = [AlphaProvider, Widget_one_2, Widget_two, Widget_one];"));
    assert.ok(text.includes("export const KIT_GATES: Gate[] = [requireAlpha, guard_session, guard_access];"));
    // same symbol, same owner, same last segment: the index breaks the tie
    assert.ok(text.includes("export const KIT_BOOT: Boot[] = [bootAlpha, warm_session, warm_session_2];"));
    assert.ok(text.includes("export const KIT_SETTINGS_ACTIONS: SettingsAction[] = [...settingsActions_alpha, ...settingsActions_beta];"));
    const locals = [...text.matchAll(/import \{ ([^}]+) \} from/g)].flatMap((m) => m[1].split(", ").map((s) => s.split(" as ").pop()));
    assert.equal(new Set(locals).size, locals.length, `duplicate local name in ${locals.join(", ")}`);
  });
});

describe("ports declared by a layer", () => {
  let kit;
  before(() => {
    kit = buildMiniKit();
    // any layer may declare a port — a surface here, modules below
    writeTree(kit, {
      "skeleton/surfaces/web/surface.json": {
        id: "web",
        title: "Web",
        packages: { root: { scripts: { "dev:client": "vite", "routes:generate": "tsr generate" }, devDependencies: { vite: "@versions" }, msw: { workerDirectory: ["apps/web/public"] } } },
        server: { portDefaults: { cache: { import: "./cache/console.provider", symbol: "CacheConsoleProvider" } } },
      },
    });
  });
  const attempt = (manifest) => () => run(kit, fresh("err-port"), manifest);
  const portsOf = (text) => text.match(/KIT_PORTS: Provider\[\] = (\[[\s\S]*?\]);/)[1].replace(/[[\]\s]/g, "").split(",").filter(Boolean);

  it("emits declaration order — base's three, then each layer's — with the declaring layer's default until claimed", () => {
    const out = fresh("out-ports");
    run(kit, out, manifestFor({ modules: ["port-user", "port-host"] }));
    const text = read(out, "apps/server/src/app.modules.gen.ts");
    assert.deepEqual(portsOf(text), [
      "NotificationConsoleProvider",
      "AnalyticsConsoleProvider",
      "TelemetryConsoleProvider",
      "CacheConsoleProvider",
      "MeiliSearchProvider",
      "QueueConsoleProvider",
    ]);
    assert.ok(text.includes('import { MeiliSearchProvider } from "./search/meili.provider";'), "the claim replaces the default");
    assert.ok(text.includes('import { QueueConsoleProvider } from "./queue/console.provider";'), "an unclaimed declared port keeps its declaring layer's default");
  });

  it("fails when a port is claimed that no layer declares, naming the port and the claimant", () => {
    expectFail(
      attempt(manifestFor({ modules: ["port-ghost"] })),
      /a claimed port is never declared:\n  - module "port-ghost" claims port "ghost", which no layer declares\ndeclared ports: notification, analytics, telemetry, cache/
    );
  });

  it("fails when two layers declare the same port, base's three included", () => {
    expectFail(attempt(manifestFor({ modules: ["port-shadow"] })), /port "analytics" is declared by more than one layer: base, port-shadow/);
    expectFail(attempt(manifestFor({ modules: ["port-host", "port-host-alt"] })), /port "search" is declared by more than one layer: port-host, port-host-alt/);
  });
});

describe("--update", () => {
  let kit;
  let out;
  before(() => {
    kit = buildMiniKit();
    out = fresh("out-update");
    run(kit, out, manifestFor({ modules: ["alpha"] }));
    // the product edits a kit file, adds its own file, adds a dependency, edits a gen file, writes its own rules
    fs.writeFileSync(path.join(out, "apps/server/src/alpha/alpha.module.ts"), "export class AlphaModule { edited = true }\n");
    fs.writeFileSync(path.join(out, "apps/server/src/mine.ts"), "mine\n");
    const pkg = readJson(out, "package.json");
    pkg.dependencies["left-pad"] = "^1.0.0";
    pkg.scripts.mine = "echo mine";
    fs.writeFileSync(path.join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    fs.appendFileSync(path.join(out, "apps/server/src/app.modules.gen.ts"), "// hand edit\n");
    fs.writeFileSync(path.join(out, "AGENTS.md"), read(out, "AGENTS.md").replace("## Conventions\n", "## Conventions\n\n- product rule\n"));
    // the kit moves on: a newer base file, a newer alpha rule, and beta's shared.ts overlay now applies
    fs.writeFileSync(path.join(kit, "skeleton/base/apps/server/src/app.module.ts"), "// v2 __PRODUCT_SLUG__\n");
    fs.writeFileSync(path.join(kit, "skeleton/modules/alpha/files/agents-fragment.md"), "- Alpha rule v2.\n");
    fs.writeFileSync(path.join(kit, "skeleton/modules/alpha/files/apps/server/src/alpha/new-in-v2.ts"), "new\n");
  });

  it("refreshes untouched kit files, never clobbers product edits, adds new files, and skips an edited gen file", () => {
    const result = run(kit, out, manifestFor({ modules: ["alpha", "beta"] }), { update: true });
    const by = Object.fromEntries(result.actions.map((a) => [a.rel, a.action]));
    assert.equal(by["apps/server/src/app.module.ts"], "update");
    assert.equal(read(out, "apps/server/src/app.module.ts"), "// v2 acme-notes\n");
    assert.equal(by["apps/server/src/alpha/alpha.module.ts"], "skip-edited");
    assert.equal(read(out, "apps/server/src/alpha/alpha.module.ts"), "export class AlphaModule { edited = true }\n");
    assert.equal(by["apps/server/src/alpha/new-in-v2.ts"], "add");
    assert.equal(by["apps/server/src/beta/beta.module.ts"], "add");
    assert.equal(by["apps/server/src/shared.ts"], "update", "untouched kit file takes the new overlay");
    assert.equal(read(out, "apps/server/src/shared.ts"), "export const from = 'beta';\n");
    assert.equal(by["apps/server/src/app.modules.gen.ts"], "skip-edited-gen");
    assert.ok(read(out, "apps/server/src/app.modules.gen.ts").endsWith("// hand edit\n"));
    assert.equal(by["shared/contracts/mocks.gen.ts"], "regenerate");
    assert.ok(read(out, "shared/contracts/mocks.gen.ts").includes("handlers_beta"));
    assert.equal(by[".spec/README.md"], "unchanged");
    assert.ok(has(out, "apps/server/src/mine.ts"));
    assert.equal(by[".claude/agents/platform-engineer.md"], "kept");
  });

  it("re-applies contributions onto a product-edited merged file without losing the edits", () => {
    const pkg = readJson(out, "package.json");
    assert.equal(pkg.dependencies["left-pad"], "^1.0.0", "product dependency survives");
    assert.equal(pkg.scripts.mine, "echo mine");
    assert.equal(pkg.dependencies.zod, "^4.3.6", "beta's contribution landed");
    assert.deepEqual(Object.keys(pkg.dependencies), ["@nestjs/common", "left-pad", "msw", "zod"]);
    const agents = read(out, "AGENTS.md");
    assert.ok(agents.includes("- product rule\n"), "product rules survive");
    assert.ok(agents.includes("<!-- kit:module:alpha -->\n- Alpha rule v2.\n<!-- /kit:module:alpha -->"), "kit-managed block refreshed in place");
    assert.ok(agents.includes("<!-- kit:module:beta -->\n- Beta rule v1.\n<!-- /kit:module:beta -->\n<!-- kit:module-rules -->"), "new block lands before the marker");
    assert.equal((agents.match(/kit:module:alpha -->/g) ?? []).length, 2, "no duplicate blocks");
    const env = read(out, ".env.example");
    assert.equal((env.match(/# --- alpha: Alpha ---/g) ?? []).length, 1, "env sections are idempotent");
    const readme = read(out, "docs/README.md");
    assert.equal((readme.match(/\(alpha\.md\)/g) ?? []).length, 1);
    assert.ok(readme.includes("- [Beta](beta.md)"));
    const biome = readJson(out, "biome.json");
    assert.deepEqual(biome.plugins, ["biome/base.grit", "biome/alpha.grit"], "biome plugins not duplicated");
    assert.equal(biome.overrides.length, 3);
    assert.equal(readJson(out, ".claude/settings.json").hooks.PostToolUse[0].hooks.length, 2, "hooks not duplicated");
  });

  it("--force-gen rewrites an edited gen file", () => {
    const result = run(kit, out, manifestFor({ modules: ["alpha", "beta"] }), { update: true, forceGen: true });
    const by = Object.fromEntries(result.actions.map((a) => [a.rel, a.action]));
    assert.equal(by["apps/server/src/app.modules.gen.ts"], "regenerate");
    assert.ok(read(out, "apps/server/src/app.modules.gen.ts").includes("BetaModule"));
    assert.ok(!read(out, "apps/server/src/app.modules.gen.ts").includes("hand edit"));
    assert.equal(by["apps/server/src/alpha/alpha.module.ts"], "skip-edited", "force-gen touches gen files only");
  });

  it("is a no-op when nothing changed", () => {
    const result = run(kit, out, manifestFor({ modules: ["alpha", "beta"] }), { update: true });
    assert.deepEqual(result.actions.filter((a) => WRITES.includes(a.action)), []);
    const lock = readJson(out, LOCK_PATH);
    assert.equal(lock.files["package.json"].pristine, false, "a merged file the product edited stays product-owned");
    assert.equal(lock.files["AGENTS.md"].pristine, false);
    assert.equal(lock.files["docs/README.md"].pristine, true);
  });

  it("dropping a module regenerates gen files, rebuilds pristine merged files, and keeps product-owned ones", () => {
    const result = run(kit, out, manifestFor({ modules: ["alpha"] }), { update: true });
    assert.ok(result.warnings.some((w) => /not in the manifest.*beta/.test(w)));
    assert.deepEqual(
      result.actions.filter((a) => WRITES.includes(a.action)).map((a) => a.rel),
      ["apps/server/src/app.modules.gen.ts", "apps/server/src/shared.ts", "apps/web/src/app/kit.gen.tsx", "docs/README.md", "shared/contracts/mocks.gen.ts"]
    );
    assert.ok(!read(out, "docs/README.md").includes("beta.md"), "pristine merged file rebuilt from the kit seed");
    assert.equal(read(out, "apps/server/src/shared.ts"), "export const from = 'alpha';\n", "overlay falls back to alpha");
    const agents = read(out, "AGENTS.md");
    assert.ok(agents.includes("- product rule\n") && agents.includes("kit:module:beta"), "product-owned merged file untouched");
    assert.equal(readJson(out, "package.json").dependencies["left-pad"], "^1.0.0");
  });

  it("without a lock, treats every existing file as product-owned", () => {
    const out2 = fresh("out-nolock");
    fs.mkdirSync(path.join(out2, "apps/server/src"), { recursive: true });
    fs.writeFileSync(path.join(out2, "apps/server/src/app.module.ts"), "theirs\n");
    const result = run(kit, out2, manifestFor({ modules: [] }), { update: true });
    const by = Object.fromEntries(result.actions.map((a) => [a.rel, a.action]));
    assert.equal(by["apps/server/src/app.module.ts"], "skip-exists");
    assert.equal(read(out2, "apps/server/src/app.module.ts"), "theirs\n");
    assert.ok(result.warnings.some((w) => /--update without/.test(w)));
  });
});

describe("vendor files and shadowed symlinks", () => {
  let kit;
  let out;
  const WORKER = "apps/web/public/mockServiceWorker.js";
  before(() => {
    kit = buildMiniKit();
    out = fresh("out-vendor");
    run(kit, out, manifestFor({ modules: [] }));
  });

  it("leaves a vendor file its toolchain rewrote alone, and never calls it a product edit", () => {
    fs.writeFileSync(path.join(out, WORKER), "/* rewritten by msw postinstall */\n"); // what `yarn install` does
    const result = run(kit, out, manifestFor({ modules: [] }), { update: true });
    const by = Object.fromEntries(result.actions.map((a) => [a.rel, a.action]));
    assert.equal(by[WORKER], "vendor");
    assert.equal(read(out, WORKER), "/* rewritten by msw postinstall */\n", "the toolchain's bytes survive");
    assert.deepEqual(result.actions.filter((a) => a.action === "skip-edited"), [], "nothing is reported as edited");
    const report = printReport(result, { update: true });
    assert.ok(!report.includes("left alone (product edits)"), `--update stays quiet:\n${report}`);
    assert.ok(report.includes("left to its toolchain"));
  });

  it("reports a real file where a .claude → .agents symlink belongs, instead of leaving a divergent copy", () => {
    const shadow = path.join(out, ".claude/commands/grill.md");
    fs.rmSync(shadow);
    fs.writeFileSync(shadow, "---\ndescription: interview\n---\n__PRODUCT_NAME__ never substituted\n");
    const result = run(kit, out, manifestFor({ modules: [] }), { update: true });
    const by = Object.fromEntries(result.actions.map((a) => [a.rel, a.action]));
    assert.equal(by[".claude/commands/grill.md"], "shadowed");
    assert.ok(read(out, ".claude/commands/grill.md").includes("never substituted"), "a copy is reported, never clobbered");
    assert.equal(by[".claude/agents/platform-engineer.md"], "kept", "a correct link stays silent");
    const report = printReport(result, { update: true });
    assert.match(report, /divergent copies[\s\S]*\.claude\/commands\/grill\.md/);
  });
});

describe("--dry-run", () => {
  it("plans everything and writes nothing", () => {
    const kit = buildMiniKit();
    const out = fresh("out-dry");
    const result = run(kit, out, manifestFor(), { dryRun: true });
    assert.ok(result.actions.length > 20);
    assert.deepEqual(fs.readdirSync(out), [".paperclip"], "only the manifest we wrote ourselves");
    assert.deepEqual(fs.readdirSync(path.join(out, ".paperclip")), ["project.manifest.json"]);
  });
});

describe("errors", () => {
  let kit;
  before(() => {
    kit = buildMiniKit();
  });
  const attempt = (manifest) => () => run(kit, fresh("err"), manifest);

  it("rejects an invalid manifest with the path of each problem", () => {
    expectFail(attempt(manifestFor({ product: { slug: "Bad Slug", name: "", scope: "acme" } })), /\$\.product\.slug.*does not match[\s\S]*\$\.product\.name: shorter/);
    expectFail(attempt(manifestFor({ surfaces: ["desktop"] })), /\$\.surfaces\[0\]: must be one of/);
    expectFail(attempt(manifestFor({ extra: 1 })), /unknown key "extra"/);
    expectFail(attempt({ product: { slug: "x", name: "X", scope: "x" } }), /missing required "surfaces"/);
  });

  it("names a module that does not exist and lists the available ones", () => {
    expectFail(attempt(manifestFor({ modules: ["ghost"] })), /"ghost" but skeleton\/modules\/ghost\/module\.json does not exist\. Available: alpha, badver/);
  });

  it("fails clearly on a missing required module and on a missing required surface", () => {
    expectFail(attempt(manifestFor({ modules: ["beta"] })), /module "beta" requires "alpha" — add "alpha" to manifest\.modules/);
    expectFail(attempt(manifestFor({ modules: ["needs-missing"] })), /"nope" is neither a known module nor a surface/);
    expectFail(attempt(manifestFor({ modules: ["needs-mobile"] })), /module "needs-mobile" requires surface "mobile", which is not in manifest\.surfaces \(web\)/);
  });

  it("fails clearly when a surface requires a surface that is not selected", () => {
    expectFail(attempt(manifestFor({ surfaces: ["mobile"], modules: [] })), /surface dependencies are not satisfied:\n  - surface "mobile" requires surface "web", which is not in manifest\.surfaces \(mobile\)/);
  });

  it("detects a dependency cycle", () => {
    expectFail(attempt(manifestFor({ modules: ["cyc-a", "cyc-b"] })), /cycle: cyc-a → cyc-b → cyc-a/);
  });

  it("fails on a package missing from versions.json, a port claimed twice, and a missing placeholder value", () => {
    expectFail(attempt(manifestFor({ modules: ["badver"] })), /"@versions" has no entry in skeleton\/versions\.json for:\n  - left-pad \(package\.json → dependencies\)/);
    expectFail(attempt(manifestFor({ modules: ["alpha", "port-clash"] })), /port "notification" is claimed by more than one module: alpha, port-clash/);
    expectFail(attempt(manifestFor({ modules: ["needs-placeholder"] })), /__SECRET_NAME__ \(needs-placeholder: Name\?\)/);
  });

  it("validates module.json against its schema", () => {
    writeTree(kit, { "skeleton/modules/broken/module.json": { id: "broken", server: { modules: [{ import: "./x" }] } } });
    expectFail(attempt(manifestFor({ modules: ["broken"] })), /skeleton\/modules\/broken\/module\.json is invalid:[\s\S]*missing required "symbol"/);
    writeTree(kit, { "skeleton/modules/misnamed/module.json": { id: "other" } });
    expectFail(attempt(manifestFor({ modules: ["misnamed"] })), /"id" is "other" but the directory is "misnamed"/);
  });
});

describe("placeholders in fragments and layer manifests", () => {
  // A module shaped like db-prisma: a workspace dependency on `@__SCOPE__/db`, a script and
  // fragments that name `__DB_NAME__`, a title and a post-scaffold note that name the product,
  // and a placeholder whose default names a base one. Surfaces go through the same path.
  let kit;
  let out;
  let result;
  before(() => {
    kit = buildMiniKit();
    writeTree(kit, {
      "skeleton/surfaces/web/surface.json": {
        id: "web",
        title: "Web",
        packages: { root: { scripts: { "dev:client": "vite --host __DOMAIN__", "routes:generate": "tsr generate" } } },
        postScaffold: ["open http://__DOMAIN__ once"],
      },
      "skeleton/modules/gamma/module.json": {
        id: "gamma",
        title: "Gamma for __PRODUCT_NAME__",
        summary: "owns the __DB_NAME__ database",
        placeholders: [{ key: "__GAMMA_HOST__", question: "Host?", default: "db.__DOMAIN__" }],
        packages: {
          root: { dependencies: { "@__SCOPE__/db": "workspace:*" }, scripts: { "gamma:migrate": "prisma migrate --db __DB_NAME__ --host __GAMMA_HOST__" } },
        },
        docs: "docs/gamma.md",
        postScaffold: ["run `yarn gamma:migrate` against __DB_NAME__"],
      },
      "skeleton/modules/gamma/docs/gamma.md": "# Gamma at __GAMMA_HOST__\n",
      "skeleton/modules/gamma/files/.env.fragment": "DATABASE_URL=postgres://localhost/__DB_NAME__\nGAMMA_HOST=__GAMMA_HOST__\n",
      "skeleton/modules/gamma/files/agents-fragment.md": "- Gamma rule: migrations run on __DB_NAME__ only.\n",
    });
    out = fresh("out");
    result = run(kit, out, manifestFor({ modules: ["gamma"] }));
  });

  it("fills .env.fragment and agents-fragment.md before they are merged", () => {
    const env = read(out, ".env.example");
    assert.ok(env.includes("# --- gamma: Gamma for Acme Notes ---\nDATABASE_URL=postgres://localhost/acme_notes\nGAMMA_HOST=db.acme-notes.example.com\n"), env);
    assert.ok(read(out, "AGENTS.md").includes("<!-- kit:module:gamma -->\n- Gamma rule: migrations run on acme_notes only.\n<!-- /kit:module:gamma -->"));
    assert.ok(!env.includes("__"), "no placeholder survives the merge");
  });

  it("fills every string in module.json and surface.json — dependency names, scripts, titles, notes", () => {
    const root = readJson(out, "package.json");
    assert.equal(root.dependencies["@acme/db"], "workspace:*", "a workspace dependency on the product's own scope");
    assert.ok(!("@__SCOPE__/db" in root.dependencies));
    assert.equal(root.scripts["gamma:migrate"], "prisma migrate --db acme_notes --host db.acme-notes.example.com");
    assert.equal(root.scripts["dev:client"], "vite --host acme-notes.example.com", "surface.json goes through the same path");
    assert.ok(read(out, "docs/README.md").includes("- [Gamma for Acme Notes](gamma.md) — owns the acme_notes database"));
    assert.equal(read(out, "docs/gamma.md"), "# Gamma at db.acme-notes.example.com\n", "a placeholder default may name a base placeholder");
    assert.ok(result.checklist.includes("[web] open http://acme-notes.example.com once"));
    assert.ok(result.checklist.includes("[gamma] run `yarn gamma:migrate` against acme_notes"));
    assert.ok(!JSON.stringify(result.layers.map((l) => l.meta)).includes("__"), "no placeholder survives in any layer manifest");
  });
});

describe("per-target env fragments and surface-gated package fragments", () => {
  // A fragment merges into the .env.example beside it: files/.env.fragment → .env.example,
  // files/apps/mobile/.env.fragment → apps/mobile/.env.example, files/tests/.env.fragment → tests/.env.example.
  // A target whose surface is not selected is skipped and listed (like files/apps/mobile/** on a web-only
  // tree); one missing for any other reason fails. packages.<mobile|tests> follow the same rule.
  const MOBILE_SEED = "# mobile\nEXPO_PUBLIC_API_URL=\n";
  const TESTS_SEED = "BASE_URL=http://localhost:5173\n";
  const both = (modules) => manifestFor({ surfaces: ["web", "mobile"], modules });
  const envKit = () => {
    const kit = buildMiniKit();
    writeTree(kit, {
      "skeleton/surfaces/mobile/apps/mobile/.env.example": MOBILE_SEED,
      "skeleton/surfaces/web/tests/.env.example": TESTS_SEED,
      "skeleton/modules/delta/module.json": { id: "delta", title: "Delta", surfaces: ["web", "mobile"] },
      "skeleton/modules/delta/files/.env.fragment": "DELTA_KEY=\n",
      "skeleton/modules/delta/files/apps/mobile/.env.fragment": "EXPO_PUBLIC_DELTA_SCHEME=__SCHEME__\n",
      "skeleton/modules/delta/files/tests/.env.fragment": "DELTA_E2E=on\n",
      "skeleton/modules/delta/files/apps/mobile/src/lib/delta.ts": "export const delta = 1;\n",
      "skeleton/modules/epsilon/module.json": { id: "epsilon", title: "Epsilon", requires: ["delta"], packages: { mobile: { dependencies: { zod: "@versions" } } } },
      "skeleton/modules/epsilon/files/apps/mobile/.env.fragment": "EXPO_PUBLIC_EPSILON=1\n",
      "skeleton/modules/epsilon/files/tests/.env.fragment": "EPSILON_E2E=1\n",
      // aims a fragment at a target no layer ships, on a surface that IS selected
      "skeleton/modules/zeta/module.json": { id: "zeta", title: "Zeta" },
      "skeleton/modules/zeta/files/apps/web/.env.fragment": "VITE_ZETA=1\n",
      // contributes to db/package.json without the module that ships it
      "skeleton/modules/theta/module.json": { id: "theta", title: "Theta", packages: { db: { scripts: { "db:theta": "tsx theta.ts" } } } },
    });
    return kit;
  };

  it("merges each fragment into the .env.example beside it, in layer order, never copying the fragment", () => {
    const out = fresh("out-env-targets");
    const result = run(envKit(), out, both(["epsilon", "delta"])); // manifest order reversed: delta comes first by requires
    assert.equal(read(out, "apps/mobile/.env.example"), `${MOBILE_SEED}\n# --- delta: Delta ---\nEXPO_PUBLIC_DELTA_SCHEME=acme-notes\n\n# --- epsilon: Epsilon ---\nEXPO_PUBLIC_EPSILON=1\n`);
    assert.equal(read(out, "tests/.env.example"), `${TESTS_SEED}\n# --- delta: Delta ---\nDELTA_E2E=on\n\n# --- epsilon: Epsilon ---\nEPSILON_E2E=1\n`);
    assert.equal(read(out, ".env.example"), "NODE_ENV=development\nPORT=3000\n\n# --- web: Web ---\nVITE_API_MODE=real\n\n# --- delta: Delta ---\nDELTA_KEY=\n");
    for (const rel of [".env.fragment", "apps/mobile/.env.fragment", "tests/.env.fragment"]) assert.ok(!has(out, rel), `${rel} is never copied`);
    const lock = readJson(out, LOCK_PATH);
    assert.equal(lock.files["apps/mobile/.env.example"].kind, "merge");
    assert.equal(lock.files["tests/.env.example"].kind, "merge");
    assert.deepEqual(readJson(out, "apps/mobile/package.json").dependencies, { zod: "^4.3.6" }, "packages.mobile lands when mobile is selected");
    assert.deepEqual(result.skipped, []);
  });

  it("--update: a pristine per-target file is rebuilt from the kit, an edited one keeps its edits, sections never duplicate", () => {
    const kit = envKit();
    const out = fresh("out-env-update");
    run(kit, out, both(["delta"]));
    fs.appendFileSync(path.join(out, "tests/.env.example"), "MY_E2E=1\n");
    fs.writeFileSync(path.join(kit, "skeleton/modules/delta/files/apps/mobile/.env.fragment"), "EXPO_PUBLIC_DELTA_SCHEME=__SCHEME__\nEXPO_PUBLIC_DELTA_V2=1\n");
    const result = run(kit, out, both(["epsilon", "delta"]), { update: true });
    const by = Object.fromEntries(result.actions.map((a) => [a.rel, a.action]));
    assert.equal(by["apps/mobile/.env.example"], "merge");
    assert.equal(
      read(out, "apps/mobile/.env.example"),
      `${MOBILE_SEED}\n# --- delta: Delta ---\nEXPO_PUBLIC_DELTA_SCHEME=acme-notes\nEXPO_PUBLIC_DELTA_V2=1\n\n# --- epsilon: Epsilon ---\nEXPO_PUBLIC_EPSILON=1\n`,
      "pristine: rebuilt from the kit seed, so the fragment's new body lands"
    );
    const tests = read(out, "tests/.env.example");
    assert.ok(tests.endsWith("MY_E2E=1\n\n# --- epsilon: Epsilon ---\nEPSILON_E2E=1\n"), tests);
    assert.equal((tests.match(/# --- delta: Delta ---/g) ?? []).length, 1, "product-owned: sections re-applied idempotently");
    assert.equal(readJson(out, LOCK_PATH).files["tests/.env.example"].pristine, false);
    const again = run(kit, out, both(["epsilon", "delta"]), { update: true });
    assert.deepEqual(again.actions.filter((a) => WRITES.includes(a.action)), [], "a second --update is a no-op");
  });

  it("skips a fragment and a package fragment aimed at a surface that is not selected, and lists them", () => {
    const out = fresh("out-env-skip");
    const result = run(envKit(), out, manifestFor({ surfaces: ["web"], modules: ["epsilon", "delta"] }));
    assert.ok(!has(out, "apps/mobile/.env.example"));
    assert.ok(!has(out, "apps/mobile/package.json"));
    assert.ok(!has(out, "apps/mobile/src/lib/delta.ts"));
    assert.equal(read(out, "tests/.env.example"), `${TESTS_SEED}\n# --- delta: Delta ---\nDELTA_E2E=on\n\n# --- epsilon: Epsilon ---\nEPSILON_E2E=1\n`, "tests rides with web");
    assert.deepEqual(result.skipped, [
      "apps/mobile/.env.fragment for delta: mobile surface not selected",
      "apps/mobile/.env.fragment for epsilon: mobile surface not selected",
      "packages.mobile for epsilon: mobile surface not selected",
    ]);
    assert.match(printReport(result, {}), /skipped \(surface not selected\):\n    apps\/mobile\/\.env\.fragment for delta: mobile surface not selected\n/);
  });

  it("still fails when the target is missing for any other reason", () => {
    const kit = envKit();
    expectFail(() => run(kit, fresh("err"), manifestFor({ modules: ["zeta"] })), /zeta ship apps\/web\/\.env\.fragment but no layer provides apps\/web\/\.env\.example/);
    expectFail(() => run(kit, fresh("err"), manifestFor({ modules: ["theta"] })), /theta contribute to packages\.db but no layer provides db\/package\.json/);
  });
});

describe("checklist", () => {
  it("drops the web-only steps on a server-only tree and adds db:generate when a db workspace is in the tree", () => {
    const kit = buildMiniKit();
    writeTree(kit, {
      "skeleton/modules/iota/module.json": { id: "iota", title: "Iota", packages: { db: { scripts: { "db:generate": "prisma generate" } } } },
      "skeleton/modules/iota/files/db/package.json": { name: "@__SCOPE__/db", scripts: {} },
    });
    const serverOnly = run(kit, fresh("out-server-only"), manifestFor({ surfaces: [], modules: [] }));
    assert.deepEqual(serverOnly.checklist, ["HUSKY=0 yarn install", "gates: yarn typecheck · yarn lint · yarn lint:guards · yarn test · yarn test:contract"]);
    const withDb = run(kit, fresh("out-db"), manifestFor({ modules: ["iota"] }));
    assert.deepEqual(withDb.checklist.slice(0, 3), ["HUSKY=0 yarn install", "yarn routes:generate", "yarn db:generate"]);
    assert.equal(readJson(withDb.outDir, "db/package.json").scripts["db:generate"], "prisma generate");
  });
});

describe("schema validator", () => {
  it("accepts the shipped example manifest against the shipped schema", () => {
    const schema = JSON.parse(fs.readFileSync(path.join(REAL_KIT, "docs/manifest.schema.json"), "utf8"));
    const example = JSON.parse(fs.readFileSync(path.join(REAL_KIT, "docs/manifest.example.json"), "utf8"));
    assert.deepEqual(validateSchema(schema, example), []);
  });
});

describe("CLI", () => {
  it("runs through bin/scaffold.sh and prints the summary and checklist", () => {
    const kit = buildMiniKit();
    const out = fresh("out-cli");
    const manifestPath = writeManifest(out, manifestFor());
    // the wrapper is shared with the real kit; point it at the mini-kit via --kit
    const stdout = execFileSync("bash", [path.join(REAL_KIT, "bin/scaffold.sh"), "--manifest", manifestPath, "--out", out, "--kit", kit], { encoding: "utf8" });
    assert.match(stdout, /scaffold → /);
    assert.match(stdout, /added/);
    assert.match(stdout, /1\. HUSKY=0 yarn install/);
    assert.match(stdout, /gates: yarn typecheck/);
    assert.ok(has(out, LOCK_PATH));
    let failed = null;
    try {
      execFileSync("bash", [path.join(REAL_KIT, "bin/scaffold.sh"), "--manifest", manifestPath, "--out", out, "--kit", kit], { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      failed = e;
    }
    assert.ok(failed, "second run without --update exits non-zero");
    assert.match(failed.stderr, /already scaffolded/);
  });
});

describe("biome-shaped JSON", () => {
  // Every JSON the engine writes is linted by the product's own Biome (lineWidth 120, two-space indent), so the
  // emitter prints what Biome's JSON formatter prints. The expected text below is Biome 2.5.12's actual output.
  it("formatJson prints what Biome prints: flat primitive arrays that fit (comma included), expanded objects, number fill", () => {
    const hundreds = (n) => Array.from({ length: n }, () => 100);
    const value = {
      one: ["x"],
      two: ["alpha", "beta"],
      empty: [],
      emptyObj: {},
      shortNums: [1, 2, 3],
      fitsObj: { node: "22.17.1", yarn: "4.18.0" },
      arrOfSmallObjs: [{ a: 1 }, { b: 2 }],
      arrOfEmptyObjs: [{}, {}],
      arrOfArrays: [["a", "b"], ["c"]],
      mixed: ["a", 1, true, null],
      nested: { deep: { deeper: ["only"] } },
      a: ["s".repeat(108)], // 120 columns with its comma: flat
      b: ["s".repeat(109)], // 121 with its comma: one per line
      f23: [1, ...hundreds(23)], // fill: the last number ends exactly at column 120
      f24: [1, ...hundreds(24)], // fill: the 23rd number would end at 120 but its comma would not
      g: [1e21, 0.000001, 123456789012],
      dropped: undefined,
      z: ["u".repeat(109)], // last member, no comma: exactly 120
    };
    const expected = `{
  "one": ["x"],
  "two": ["alpha", "beta"],
  "empty": [],
  "emptyObj": {},
  "shortNums": [1, 2, 3],
  "fitsObj": {
    "node": "22.17.1",
    "yarn": "4.18.0"
  },
  "arrOfSmallObjs": [
    {
      "a": 1
    },
    {
      "b": 2
    }
  ],
  "arrOfEmptyObjs": [{}, {}],
  "arrOfArrays": [["a", "b"], ["c"]],
  "mixed": ["a", 1, true, null],
  "nested": {
    "deep": {
      "deeper": ["only"]
    }
  },
  "a": ["${"s".repeat(108)}"],
  "b": [
    "${"s".repeat(109)}"
  ],
  "f23": [
    1, ${hundreds(23).join(", ")}
  ],
  "f24": [
    1, ${hundreds(22).join(", ")},
    100, 100
  ],
  "g": [1e21, 0.000001, 123456789012],
  "z": ["${"u".repeat(109)}"]
}
`;
    assert.equal(formatJson(value), expected);
    assert.equal(formatJson([]), "[]\n");
    // package.json is formatted by Biome with `expand: always`: every non-empty array and object breaks.
    assert.equal(
      formatJson({ workspaces: ["tests"], msw: { workerDirectory: ["apps/web/public"] }, files: [], n: [1e21] }, { expand: true }),
      '{\n  "workspaces": [\n    "tests"\n  ],\n  "msw": {\n    "workerDirectory": [\n      "apps/web/public"\n    ]\n  },\n  "files": [],\n  "n": [\n    1e21\n  ]\n}\n'
    );
    assert.equal(formatJson([{ path: "a", rule: "e2e" }]), '[\n  {\n    "path": "a",\n    "rule": "e2e"\n  }\n]\n');
  });

  // Run against the pinned Biome when one is reachable (BIOME_BIN, or biome on PATH): the emitted merged files and
  // the ledger must come back from `biome format` unchanged. Two base overrides + alpha's, and a non-empty modules list.
  it("emits biome.json, .claude/settings.json, package.json, the allowlist and the ledger exactly as biome format prints them", (t) => {
    const onPath = (process.env.PATH ?? "").split(path.delimiter).map((d) => path.join(d, "biome")).find((p) => fs.existsSync(p));
    const biome = process.env.BIOME_BIN ?? onPath;
    if (!biome) {
      t.skip("no biome binary: set BIOME_BIN to the pinned @biomejs/biome to run this check");
      return;
    }
    const kit = buildMiniKit();
    const out = fresh("out-biome");
    run(kit, out, manifestFor());
    assert.equal(readJson(out, "biome.json").overrides.length, 3, "two base overrides plus alpha's");
    assert.deepEqual(readJson(out, LOCK_PATH).modules, ["alpha", "beta"]);
    const cfg = fresh("biome-cfg");
    writeTree(cfg, { "biome.json": { formatter: { indentStyle: "space", indentWidth: 2, lineWidth: 120 } } });
    for (const rel of ["biome.json", ".claude/settings.json", "package.json", "tests/package.json", "scripts/test-contract.allow.json", "scripts/lint-canary/canaries.json", LOCK_PATH]) {
      const emitted = read(out, rel);
      const formatted = execFileSync(biome, ["format", "--config-path", cfg, `--stdin-file-path=${path.basename(rel)}`], { input: emitted, encoding: "utf8" });
      assert.equal(formatted, emitted, `${rel} is not what biome format prints`);
    }
  });
});
