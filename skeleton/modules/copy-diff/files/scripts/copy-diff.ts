/**
 * `yarn copy:diff` — holds the product's copy layer (`@domain/copy`) against a reference
 * copy module (a design tool's export, a base locale, a prototype's copy file) and prints
 * what changed, what the app is missing, and what the app added. The reference comes from
 * disk (`COPY_DIFF_PATH`) or from git (`COPY_DIFF_REF` + `COPY_DIFF_PATH`, no second
 * checkout needed). Exit 1 on any diff the allowlist does not absorb — the CI gate;
 * allowlisted divergences still print, so a ruled divergence stays visible. With no
 * reference configured the run says so and exits 0, so the gate ships before the
 * reference does.
 *
 * Runs under tsx (see package.json): both sides are TypeScript, evaluated, then flattened
 * by `copy-diff.core.ts`. `--json` prints the same report as one JSON object.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
import { ALLOW_RULES } from "./copy-diff.allowlist";
import {
  type AllowedEntry,
  type CopyDiff,
  type FlatCopy,
  diffCopy,
  flattenCopy,
  partitionDiff,
} from "./copy-diff.core";

// `.env` is the local home of COPY_DIFF_*; CI sets them on the step. A set variable wins over the file.
loadDotenv({ quiet: true });

/** yarn runs this from the product root; an on-disk COPY_DIFF_PATH is relative to it. */
const ROOT = process.cwd();
const JSON_OUTPUT = process.argv.includes("--json");
const NO_REFERENCE =
  "no reference configured — set COPY_DIFF_PATH (and optionally COPY_DIFF_REF) to the reference copy module";

type Reference = { path: string; ref: string | null };

type Report = {
  reference: Reference;
  keys: { app: number; reference: number };
  allowed: AllowedEntry[];
  blocking: CopyDiff;
  ok: boolean;
};

function readReference(): Reference | null {
  const path = process.env.COPY_DIFF_PATH?.trim();
  const ref = process.env.COPY_DIFF_REF?.trim() || null;
  if (path) return { path, ref };
  if (ref) throw new Error("COPY_DIFF_REF is set but COPY_DIFF_PATH is not — the ref needs a path to read");
  return null;
}

const labelOf = (reference: Reference): string =>
  reference.ref ? `${reference.ref}:${reference.path}` : reference.path;

async function evaluate(file: string): Promise<FlatCopy> {
  const namespace = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  // a CommonJS-interop namespace repeats the exports under `default` and flags `__esModule`
  const sections = Object.fromEntries(
    Object.entries(namespace).filter(([key]) => key !== "default" && key !== "__esModule")
  );
  return flattenCopy(sections);
}

function gitShow(ref: string, path: string): string {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr).trim() : "";
    throw new Error(`git show ${ref}:${path} failed${stderr ? ` — ${stderr}` : ""}`);
  }
}

async function loadReference(reference: Reference): Promise<FlatCopy> {
  if (!reference.ref) {
    const file = resolve(ROOT, reference.path);
    if (!existsSync(file)) throw new Error(`COPY_DIFF_PATH not found on disk: ${file}`);
    return evaluate(file);
  }
  // git resolves the path from the repository root; reading the ref keeps the run free of a second checkout
  const source = gitShow(reference.ref, reference.path);
  const dir = mkdtempSync(join(tmpdir(), "copy-diff-"));
  try {
    // the source's own extension so tsx picks the right loader; a reference that imports its
    // siblings cannot be evaluated alone and is pointed at on disk instead
    const file = join(dir, `reference${extname(reference.path) || ".ts"}`);
    writeFileSync(file, source);
    return await evaluate(file);
  } finally {
    // the temp module is in memory once imported — never left behind on disk
    rmSync(dir, { recursive: true, force: true });
  }
}

async function loadApp(): Promise<FlatCopy> {
  const barrel = (await import("../shared/domain/copy")) as Record<string, unknown>;
  return flattenCopy({ ...barrel });
}

const show = (value: string | undefined): string => JSON.stringify(value ?? "");

function printBlocking(diff: CopyDiff): void {
  if (diff.changed.length > 0) {
    console.log(`\nCHANGED — reference moved or app drifted (${diff.changed.length}):`);
    for (const entry of diff.changed)
      console.log(`  ${entry.key}:\n    app  ${show(entry.app)}\n    ref  ${show(entry.reference)}`);
  }
  if (diff.missing.length > 0) {
    console.log(`\nMISSING IN APP (${diff.missing.length}):`);
    for (const entry of diff.missing) console.log(`  ${entry.key}: ${show(entry.reference)}`);
  }
  if (diff.extra.length > 0) {
    console.log(`\nEXTRA IN APP (${diff.extra.length}):`);
    for (const entry of diff.extra) console.log(`  ${entry.key}: ${show(entry.app)}`);
  }
}

function printReport(report: Report): void {
  console.log(`copy:diff — @domain/copy vs ${labelOf(report.reference)}`);
  console.log(`compared ${report.keys.app} app keys against ${report.keys.reference} reference keys`);

  // The ruled divergences stay visible on every run — absorbing a diff must never hide it.
  const allowedChanged = report.allowed.filter((entry) => entry.kind === "changed");
  if (allowedChanged.length > 0) {
    console.log(
      `\nALLOWLISTED DIVERGENCES — ruled or pending, see scripts/copy-diff.allowlist.ts (${allowedChanged.length}):`
    );
    for (const entry of allowedChanged) {
      console.log(`  ${entry.key} — ${entry.reason}\n    app  ${show(entry.app)}\n    ref  ${show(entry.reference)}`);
    }
  }
  const absorbed = report.allowed.length - allowedChanged.length;
  if (absorbed > 0) {
    console.log(`\nallowlisted as not-yet-adopted or app-only: ${absorbed} keys (the allowlist is the progress meter)`);
  }

  if (report.ok) {
    console.log("\nOK — no diffs outside the allowlist.");
    return;
  }
  printBlocking(report.blocking);
  const count = report.blocking.changed.length + report.blocking.missing.length + report.blocking.extra.length;
  console.log(`\nFAIL — ${count} diff(s) outside the allowlist.`);
}

async function main(): Promise<void> {
  const reference = readReference();
  if (!reference) {
    if (JSON_OUTPUT) console.log(JSON.stringify({ reference: null, ok: true, note: NO_REFERENCE }));
    else console.log(`copy:diff — ${NO_REFERENCE}`);
    return;
  }

  const [app, ref] = await Promise.all([loadApp(), loadReference(reference)]);
  const { blocking, allowed } = partitionDiff(diffCopy(app, ref), ALLOW_RULES);
  const report: Report = {
    reference,
    keys: { app: Object.keys(app).length, reference: Object.keys(ref).length },
    allowed,
    blocking,
    ok: blocking.changed.length + blocking.missing.length + blocking.extra.length === 0,
  };

  if (JSON_OUTPUT) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (JSON_OUTPUT) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`copy:diff — ${message}`);
  process.exitCode = 1;
});
