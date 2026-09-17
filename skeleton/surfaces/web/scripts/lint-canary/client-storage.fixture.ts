// Deliberately violates biome/client-storage.grit outside apps/web/src/data:
// direct localStorage and document.cookie access.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
export function lintCanaryStorage(): void {
  localStorage.setItem("lint-canary", "1");
  document.cookie = "lint-canary=1";
}
