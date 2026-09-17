#!/usr/bin/env node
/**
 * The testing contract, enforced structurally.
 *
 *   1. Every screen  (apps/{web,mobile}/src/**\/screens/**\/*.tsx)  → sibling *.spec.tsx
 *   2. Every routed WEB screen                                   → tests/specs/web/contract/<journey>/<kebab-name>.spec.ts
 *   3. The Playwright suite locates by testid, never by copy      (tests/specs/web/**, tests/pages/**)
 *   4. apps/web/src/testing/seeds.ts holds only `import type`
 *   5. Element catalogs (tests/elements/*.yaml) carry no copy locator under `web:`
 *   6. Every server controller/service (src/**)                  → sibling *.spec.ts
 *
 * Rule 2 is web-only on purpose: it feeds the Playwright contract suite, and the mobile
 * e2e suite is device-driven. The e2e specs are hand-written, individual and
 * self-explanatory — the contract only checks the file EXISTS for each routed screen
 * (Account.tsx → account.spec.ts under any journey folder); what it asserts is the spec
 * author's craft, reviewed like any other code.
 *
 * A surface that is not present is not checked: no apps/web means rules 2–5 are skipped,
 * no apps/mobile means its screens are not walked. The script never fails on absence.
 *
 * Coverage percentages are gameable; file presence is not. Exemptions live in
 * test-contract.allow.json next to this script — an allowlist entry is a
 * reviewable diff with a reason, not a silent omission.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p);

const allow = JSON.parse(readFileSync(join(ROOT, "scripts/test-contract.allow.json"), "utf8"));
const allowed = (path, rule) => allow.some((a) => a.path === path && a.rule === rule);

const SKIP_DIRS = new Set(["node_modules", "dist", "generated", ".expo", "ios", "android"]);
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const violations = [];
const hasWeb = existsSync(join(ROOT, "apps/web/src"));
const hasMobile = existsSync(join(ROOT, "apps/mobile/src"));

// ── 1 + 2: screens ────────────────────────────────────────────────────────────
// Source is feature-first: a screen is any .tsx inside a `screens/` directory, wherever
// that directory sits. `e2e` marks the apps whose screens the Playwright suite covers.
const srcRoots = [
  { dir: join(ROOT, "apps/web/src"), e2e: true, present: hasWeb },
  { dir: join(ROOT, "apps/mobile/src"), e2e: false, present: hasMobile },
];

// Account.tsx → account.spec.ts, OnboardingFlow.tsx → onboarding-flow.spec.ts
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// Specs are organised by user journey under contract (tests/specs/web/contract/<journey>/)
// — the gate matches on the file NAME, anywhere under contract/; the journey folder
// is the author's narrative choice, not something a script should dictate.
const e2eSpecsByName = new Map(
  walk(join(ROOT, "tests/specs/web/contract"))
    .filter((p) => p.endsWith(".spec.ts"))
    .map((p) => [p.split(sep).pop(), rel(p)])
);

const screenFiles = srcRoots
  .filter(({ present }) => present)
  .flatMap(({ dir, e2e }) =>
    walk(dir)
      .filter((p) => p.endsWith(".tsx") && !p.endsWith(".spec.tsx") && p.split(sep).includes("screens"))
      .map((path) => ({ path, e2e }))
  );

for (const { path: screen, e2e } of screenFiles) {
  const base = screen.slice(0, -".tsx".length);
  const r = rel(screen);
  if (!existsSync(`${base}.spec.tsx`) && !allowed(r, "unit")) {
    violations.push(`${r} — no sibling spec (${rel(base)}.spec.tsx). Rule: every screen has unit tests.`);
  }
  const specName = `${kebab(base.split(sep).pop())}.spec.ts`;
  if (e2e && !e2eSpecsByName.has(specName) && !allowed(r, "e2e")) {
    violations.push(
      `${r} — no e2e spec (${specName} under tests/specs/web/contract/<journey>/). Rule: every routed screen has a Playwright contract journey spec.`
    );
  }
}

// ── 3: e2e specs locate by testid/tag, never by copy ─────────────────────────
// I18n will translate every visible string, placeholder and accessible name — a
// locator built on copy is a test that breaks in every locale but one. Locate by
// data-testid, assert by screen tag / testid visibility / real data.
const COPY_LOCATORS = /getBy(Text|Placeholder|Label|Title|AltText)\(/;
// getByRole with a literal `name` matcher is copy-coupled the same way: the
// accessible name is translated copy. Role alone, or a dynamic name, is fine.
const ROLE_WITH_NAME = /getByRole\(\s*["'][^"']+["']\s*,\s*\{[^}]*\bname\s*:\s*["'/]/;
const COPY_SCAN_ROOTS = ["tests/specs/web", "tests/pages"];
if (hasWeb) {
  for (const root of COPY_SCAN_ROOTS) {
    for (const file of walk(join(ROOT, root)).filter((p) => p.endsWith(".ts"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // dynamic-data assertions are fine; a literal string in the matcher is copy
        if (COPY_LOCATORS.test(line) && /getBy[A-Za-z]+\(\s*["'/]/.test(line) && !/getByText\(`/.test(line)) {
          violations.push(
            `${rel(file)}:${i + 1} — copy-coupled locator (${line.trim().slice(0, 80)}). Rule: e2e locates by testid, asserts by tag/testid/data.`
          );
        }
        if (ROLE_WITH_NAME.test(line)) {
          violations.push(
            `${rel(file)}:${i + 1} — getByRole with a literal name matches translated copy (${line.trim().slice(0, 80)}). Rule: e2e locates by testid; role-only getByRole is fine.`
          );
        }
      });
    }
  }
}

// ── 4: seeds.ts stays plain data ─────────────────────────────────────────────
// The Playwright suite imports it; a runtime import there drags the app into the
// Playwright process. Only `import type` is allowed.
const SEEDS = join(ROOT, "apps/web/src/testing/seeds.ts");
if (hasWeb && existsSync(SEEDS)) {
  readFileSync(SEEDS, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line)) {
        violations.push(
          `${rel(SEEDS)}:${i + 1} — runtime import in seeds.ts (${line.trim().slice(0, 80)}). Rule: seeds are plain data; only \`import type\` is allowed.`
        );
      }
    });
}

// ── 5: element catalogs ──────────────────────────────────────────────────────
// The catalogs bridge web and mobile — web entries must not carry copy either.
if (hasWeb) {
  for (const yaml of walk(join(ROOT, "tests/elements")).filter((p) => p.endsWith(".yaml"))) {
    const lines = readFileSync(yaml, "utf8").split("\n");
    let inWeb = false;
    lines.forEach((line, i) => {
      if (/^\s{2}web:\s*$/.test(line)) inWeb = true;
      else if (/^\s{2}\w+:\s*$/.test(line)) inWeb = false;
      if (inWeb && /locator:\s*(text|placeholder|label|title)\b/.test(line)) {
        violations.push(
          `${rel(yaml)}:${i + 1} — web catalog entry uses a copy locator. Rule: web strategies are testid (or css); copy strategies stay mobile-only if a platform demands them.`
        );
      }
      if (inWeb && /value:.*\[name=/.test(line)) {
        violations.push(
          `${rel(yaml)}:${i + 1} — web catalog role locator matches an accessible NAME (copy). Rule: use testid.`
        );
      }
    });
  }
}

// ── 6: server controllers and services ───────────────────────────────────────
const serverFiles = walk(join(ROOT, "apps/server/src")).filter(
  (p) => /\.(controller|service)\.ts$/.test(p) && !p.endsWith(".spec.ts") && !p.includes(`${sep}generated${sep}`)
);
for (const f of serverFiles) {
  const base = f.slice(0, -".ts".length);
  const r = rel(f);
  if (!existsSync(`${base}.spec.ts`) && !allowed(r, "unit")) {
    violations.push(`${r} — no sibling spec (${rel(base)}.spec.ts). Rule: every controller/service has unit tests.`);
  }
}

// An allowlist entry whose file is gone is debt that outlived its reason.
for (const a of allow) {
  if (!existsSync(join(ROOT, a.path))) {
    violations.push(`scripts/test-contract.allow.json — ${a.path} (${a.rule}) no longer exists; drop the entry.`);
  }
}

if (violations.length > 0) {
  console.error("Testing contract violations:\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error("\nEither add the missing tests, or add an entry with a reason to scripts/test-contract.allow.json.");
  process.exit(1);
}
console.log(`test contract OK — ${screenFiles.length} screens, ${serverFiles.length} server units checked`);
