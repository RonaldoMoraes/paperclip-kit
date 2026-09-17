#!/usr/bin/env node
/**
 * Gate: contract/smoke/regression specs must not call raw Playwright/Appium locators.
 * Use pages/ + elements YAML (includes contract journeys under specs/web/contract).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPECS = [
  join(ROOT, "specs/web/contract"),
  join(ROOT, "specs/web/smoke"),
  join(ROOT, "specs/web/regression"),
  join(ROOT, "specs/mobile/smoke"),
  join(ROOT, "specs/mobile/regression"),
];

const BANNED = [
  /\bpage\.getBy(?:TestId|Role|Text|Label|Placeholder|Title)\s*\(/,
  /\bpage\.locator\s*\(/,
  /\bdriver\.\$\s*\(/,
  /\bbrowser\.\$\s*\(/,
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".js")) out.push(p);
  }
  return out;
}

const violations = [];
for (const dir of SPECS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      for (const re of BANNED) {
        if (re.test(line)) {
          violations.push(`${relative(ROOT, file)}:${i + 1} — raw locator (use POM + elements YAML)`);
        }
      }
    });
  }
}

if (violations.length) {
  console.error("validate:specs failed:\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}

console.log("validate:specs OK — no raw locators in contract/smoke/regression specs");
