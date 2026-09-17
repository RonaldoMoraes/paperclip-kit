#!/usr/bin/env node
/**
 * Which screens ship their events, on every app present. A report, never a gate: whether
 * a screen owes an event is a product question (`AGENTS.md`, "Hit every surface"), and a
 * script cannot tell a screen with nothing to count from one that forgot.
 *
 * A screen counts as tracked when the route that mounts it — any route file naming its
 * component — a hook in its own feature, or the screen file itself calls `track(`. That
 * is where tracking belongs: at the transport edge, and in a screen only for a tap it
 * owns. `screen-viewed` is automatic and is not what this looks for.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APPS = [
  { name: "web", features: "apps/web/src/features", routes: "apps/web/src/app/routes" },
  { name: "mobile", features: "apps/mobile/src/features", routes: "apps/mobile/app" },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.includes("__lint-canary__")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const isSource = (p) => p.endsWith(".tsx") || p.endsWith(".ts");
const isSpec = (p) => /\.spec\.tsx?$/.test(p);
const mentions = (file, name) => {
  const src = readFileSync(file, "utf8");
  return src.includes(`/${name}"`) || src.includes(`{ ${name} }`) || src.includes(`<${name}`);
};
const tracks = (file) => readFileSync(file, "utf8").includes("track(");

let screens = 0;
let tracked = 0;

for (const app of APPS) {
  const features = join(ROOT, app.features);
  if (!existsSync(features)) continue;

  const routeFiles = walk(join(ROOT, app.routes)).filter((p) => isSource(p) && !isSpec(p));
  const screenFiles = walk(features).filter(
    (p) => p.endsWith(".tsx") && !isSpec(p) && p.split(sep).includes("screens")
  );

  console.log(`\nanalytics coverage — ${app.name} screens, and where their events are tracked:`);
  for (const screen of screenFiles) {
    const name = screen.split(sep).pop().slice(0, -".tsx".length);
    const feature = relative(features, screen).split(sep)[0];
    const hooks = join(features, feature, "hooks");
    const sources = [
      screen,
      ...routeFiles.filter((file) => mentions(file, name)),
      ...walk(hooks).filter((p) => isSource(p) && !isSpec(p)),
    ];
    const where = sources.filter(tracks).map((p) => relative(ROOT, p));
    screens += 1;
    if (where.length > 0) tracked += 1;
    console.log(where.length > 0 ? `  ✓ ${feature}/${name} — ${where.join(", ")}` : `  · ${feature}/${name} — none`);
  }
}

console.log(`\n${tracked} of ${screens} screens track an event (screen-viewed is automatic and not counted).`);
