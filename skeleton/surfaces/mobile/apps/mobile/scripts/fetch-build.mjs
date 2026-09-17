#!/usr/bin/env node
// Downloads the newest finished EAS build for a platform and profile into `.expo/builds/`
// and prints its path — what Appium's `APP_PATH` and a manual install both need.
//
//   node scripts/fetch-build.mjs android preview
//   APP_PATH=$(node scripts/fetch-build.mjs android development)
//
// Needs a logged-in EAS CLI (`eas login`) or EXPO_TOKEN.
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const [platform = "android", profile = "development"] = process.argv.slice(2);
if (!["android", "ios"].includes(platform)) {
  console.error(`platform must be android or ios; got "${platform}"`);
  process.exit(1);
}

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const listing = execFileSync(
  "npx",
  [
    "eas-cli",
    "build:list",
    "--json",
    "--non-interactive",
    "--platform",
    platform,
    "--buildProfile",
    profile,
    "--status",
    "finished",
    "--limit",
    "1",
  ],
  { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
);
const [build] = JSON.parse(listing);
const url = build?.artifacts?.applicationArchiveUrl;
if (!url) {
  console.error(`No finished ${platform} build for profile "${profile}".`);
  process.exit(1);
}

const extension = new URL(url).pathname.split(".").pop() || (platform === "android" ? "apk" : "tar.gz");
const target = join(appDir, ".expo", "builds", `${platform}-${profile}.${extension}`);
await mkdir(dirname(target), { recursive: true });
const response = await fetch(url);
if (!response.ok || !response.body) {
  console.error(`Download failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
console.error(`Build ${build.id} (${build.appVersion} / ${build.appBuildVersion}) saved.`);
console.log(target);
