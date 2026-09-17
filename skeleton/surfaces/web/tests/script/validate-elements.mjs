#!/usr/bin/env node
/**
 * Gate: every elements/*.yaml key has locator+value for web + mobile, strategies are
 * allowlisted, and every webLocator / getElementEntry / mobileSelector key used under
 * pages/ exists in the catalog.
 *
 * A key that exists on one platform only declares the other front as `none`. Both fronts
 * are still required: an omission reads as an oversight, and mirroring the id there would
 * point at a testid the other app does not have.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ELEMENTS_DIR = join(ROOT, "elements");
const PAGES_DIR = join(ROOT, "pages");

const ALLOWED_PLATFORMS = new Set(["web", "mobile"]);
const NO_COUNTERPART = "none";
const WEB = new Set(["testid", "role", "text", "placeholder", "css", "label"]);
const MOBILE = new Set(["testid", "accessibility id", "id", "xpath", "class name"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const violations = [];

// One flat namespace across the files: a key declared twice would let one screen's file
// decide another's locator, so the collision is a failure and not a merge order.
const catalog = {};
const owner = new Map();
for (const file of walk(ELEMENTS_DIR).filter((p) => /\.ya?ml$/.test(p))) {
  const doc = parseYaml(readFileSync(file, "utf8")) ?? {};
  for (const key of Object.keys(doc)) {
    const first = owner.get(key);
    if (first) violations.push(`"${key}" is declared in both ${first} and ${relative(ROOT, file)}`);
    else owner.set(key, relative(ROOT, file));
  }
  Object.assign(catalog, doc);
}

for (const [key, platforms] of Object.entries(catalog)) {
  const fronts = platforms ?? {};
  for (const platform of Object.keys(fronts)) {
    if (!ALLOWED_PLATFORMS.has(platform)) {
      violations.push(`${key}.${platform}: use web or mobile only (not ios/android)`);
    }
  }
  for (const front of ["web", "mobile"]) {
    if (!fronts[front]) {
      violations.push(`${key}: missing ${front} entry (use \`none\` when the platform has no counterpart)`);
    }
  }
  for (const [platform, entry] of Object.entries(fronts)) {
    if (!ALLOWED_PLATFORMS.has(platform)) continue;
    if (entry === NO_COUNTERPART) continue;
    if (!entry || typeof entry !== "object") {
      violations.push(`${key}.${platform}: expected { locator, value }`);
      continue;
    }
    if (!entry.locator || !entry.value) {
      violations.push(`${key}.${platform}: missing locator or value`);
      continue;
    }
    const allow = platform === "web" ? WEB : MOBILE;
    if (!allow.has(entry.locator)) {
      violations.push(`${key}.${platform}: unsupported locator "${entry.locator}"`);
    }
  }
}

const keyRef = /\b(?:webLocator|getElementEntry)\(\s*(?:page|driver|this\.page|this\.driver)?\s*,\s*["']([\w.-]+)["']/g;
const mobileKeyRef = /\bmobileSelector\(\s*["']([\w.-]+)["']/g;

const used = new Set();
for (const file of walk(PAGES_DIR).filter((p) => p.endsWith(".ts"))) {
  const src = readFileSync(file, "utf8");
  for (const re of [keyRef, mobileKeyRef]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) used.add(m[1]);
  }
}

for (const key of used) {
  if (!catalog[key]) {
    violations.push(`pages reference unknown element key "${key}"`);
  }
}

if (violations.length) {
  console.error("validate:elements failed:\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}

console.log(`validate:elements OK — ${Object.keys(catalog).length} keys, ${used.size} referenced from pages/`);
