#!/usr/bin/env node
/**
 * The lint-guard canary: proves every Biome GritQL plugin is wired AND alive.
 *
 * A dead guard is worse than no guard — the architecture rules it enforces
 * (vendor-SDK quarantines, storage/state boundaries, spec hygiene) fail open
 * with zero diagnostics and nobody notices. That happened once: Biome's
 * snippet patterns (`import $x from $src`) silently match only single-specifier
 * import clauses, so every real multi-name violation walked through while the
 * lint stayed green.
 *
 *   1. Wiring  — every biome/*.grit is referenced by biome.json, and every
 *                referenced plugin file exists on disk.
 *   2. Firing  — every fixture listed in scripts/lint-canary/canaries.json (one
 *                per plugin, each a deliberate violation) is copied to a path the
 *                plugin's biome.json scope covers, linted with the real config,
 *                and must produce its plugin diagnostic. Zero diagnostics from
 *                any plugin fails the gate.
 *
 * canaries.json is a list, not code, so surfaces and modules can merge their own
 * entries in: `{ plugin, fixture, dest, expect: [{ needle, min }] }`. `dest` must
 * sit inside the plugin's override scope; `min` covers a fixture that holds
 * several distinct violations of the same rule.
 *
 * The fixtures are excluded from the normal lint in biome.json
 * (files.includes: "!scripts/lint-canary"), so `yarn lint` stays clean; the
 * transient copies (*__lint-canary__*) exist only while this script runs and
 * are removed even on failure. A stale copy left by a crash fails `yarn lint`
 * loudly — visible, not silent.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = join(ROOT, "scripts/lint-canary");
const CANARIES = JSON.parse(readFileSync(join(FIXTURES_DIR, "canaries.json"), "utf8"));

const violations = [];

// ── 1: wiring — biome.json references every plugin, every reference exists ────
const biomeConfig = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8"));
const referenced = [
  ...(biomeConfig.plugins ?? []),
  ...(biomeConfig.overrides ?? []).flatMap((o) => o.plugins ?? []),
].map((p) => p.replace(/^\.\//, ""));

for (const p of referenced) {
  if (!existsSync(join(ROOT, p))) violations.push(`biome.json references ${p}, which does not exist.`);
}
for (const f of readdirSync(join(ROOT, "biome")).filter((f) => f.endsWith(".grit"))) {
  if (!referenced.includes(`biome/${f}`)) {
    violations.push(`biome/${f} exists but is not referenced by biome.json — the guard is unplugged.`);
  }
}
for (const c of CANARIES) {
  if (!referenced.includes(c.plugin))
    violations.push(`${c.plugin} is not referenced by biome.json — the guard is unplugged.`);
  if (!existsSync(join(FIXTURES_DIR, c.fixture))) violations.push(`missing fixture scripts/lint-canary/${c.fixture}.`);
  if (!/__lint-canary__/.test(c.dest))
    violations.push(`${c.plugin}: dest ${c.dest} must contain "__lint-canary__" so a stale copy is recognisable.`);
}
for (const p of referenced) {
  if (!CANARIES.some((c) => c.plugin === p)) {
    violations.push(
      `${p} is wired but has no canary entry in scripts/lint-canary/canaries.json — nothing proves it fires.`
    );
  }
}

// ── 2: firing — each fixture, linted under the real config, must trip its guard ─
const dests = CANARIES.map((c) => join(ROOT, c.dest));

// What to remove afterwards: the copied file, or — when the dest sits inside a
// transient `__lint-canary__` directory (a plugin scoped to features/**/screens/**,
// say) — that whole directory.
const cleanupTargets = new Set();
for (const dest of dests) {
  const parts = relative(ROOT, dest).split(sep);
  const i = parts.indexOf("__lint-canary__");
  cleanupTargets.add(i >= 0 ? join(ROOT, ...parts.slice(0, i + 1)) : dest);
}

let report;
try {
  for (const [i, c] of CANARIES.entries()) {
    mkdirSync(dirname(dests[i]), { recursive: true });
    copyFileSync(join(FIXTURES_DIR, c.fixture), dests[i]);
  }

  const run = spawnSync(
    "yarn",
    ["biome", "lint", "--max-diagnostics=none", "--reporter=json", ...CANARIES.map((c) => c.dest)],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (run.error) throw run.error;
  const jsonStart = run.stdout.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(
      `biome produced no JSON report.\nstdout: ${run.stdout.slice(0, 2000)}\nstderr: ${run.stderr.slice(0, 2000)}`
    );
  }
  report = JSON.parse(run.stdout.slice(jsonStart));
} finally {
  for (const target of cleanupTargets) rmSync(target, { recursive: true, force: true });
}

// Biome's JSON reporter changed shape between 2.3 (`description`, `location.path.file`)
// and 2.5 (`message` string, `location.path` string). Read both so a Biome upgrade
// cannot turn every canary silent — which is exactly the failure this gate exists for.
const textOf = (d) => {
  if (typeof d.description === "string" && d.description) return d.description;
  if (typeof d.message === "string") return d.message;
  if (Array.isArray(d.message)) return d.message.map((m) => (typeof m === "string" ? m : (m?.content ?? ""))).join("");
  return "";
};
const fileOf = (d) => {
  const p = d.location?.path;
  return (typeof p === "string" ? p : (p?.file ?? "")).replace(/\\/g, "/");
};

const pluginDiagnostics = report.diagnostics.filter((d) => d.category === "plugin");

// A plugin that fails to load surfaces as a diagnostic too — that is a wiring
// failure, not a guard firing.
for (const d of pluginDiagnostics) {
  if (/loading of plugins|Failed to compile/i.test(textOf(d))) {
    violations.push(`plugin failed to load/compile: ${textOf(d)}`);
  }
}

for (const [i, c] of CANARIES.entries()) {
  const mine = pluginDiagnostics.filter((d) => fileOf(d) === c.dest || fileOf(d).endsWith(`/${c.dest}`));
  for (const { needle, min } of c.expect) {
    const hits = mine.filter((d) => textOf(d).includes(needle)).length;
    if (hits < min) {
      violations.push(
        `${c.plugin} produced ${hits}/${min} "${needle}" diagnostic(s) on ${relative(ROOT, dests[i])} — the guard is dead or the pattern rotted.`
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Lint-guard canary failures:\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(
    "\nA guard that produces no diagnostic on its known-violating fixture is failing open." +
      "\nCheck biome.json plugin wiring, the .grit pattern, and the Biome version's GritQL behavior."
  );
  process.exit(1);
}
console.log(
  `lint guards OK — ${referenced.length} plugin references wired, ${CANARIES.length} fixtures fired ${pluginDiagnostics.length} diagnostics`
);
