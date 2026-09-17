#!/usr/bin/env node
/**
 * Run the named package.json scripts that exist; skip silently the ones that do not.
 *
 *   node scripts/run-if-script.mjs build:client            # one script, if present
 *   node scripts/run-if-script.mjs 'typecheck:*'           # every script with that prefix, in package.json order
 *   node scripts/run-if-script.mjs test:mobile test:tests  # several, in the order given
 *
 * Why: the root scripts (`dev`, `build`, `typecheck`, `test`) are owned by base, while a
 * surface adds `dev:client`, `build:client`, `typecheck:web`, `test:mobile`… through its
 * package.json fragment. A base script cannot name a script that may not exist —
 * `yarn build:client` fails on a server-only product — so it names it through here.
 * The first failing script stops the run and its exit code is propagated.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts ?? {};
const names = Object.keys(scripts);

const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  console.error("usage: run-if-script.mjs <script | prefix:*> ...");
  process.exit(2);
}

const selected = [];
for (const w of wanted) {
  if (w.endsWith("*")) {
    const prefix = w.slice(0, -1);
    for (const n of names) if (n.startsWith(prefix) && !selected.includes(n)) selected.push(n);
  } else if (names.includes(w) && !selected.includes(w)) {
    selected.push(w);
  }
}

for (const name of selected) {
  const run = spawnSync("yarn", ["run", name], { cwd: ROOT, stdio: "inherit" });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
