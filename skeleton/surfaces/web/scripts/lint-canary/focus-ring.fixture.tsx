// Deliberately violates biome/focus-ring.grit: suppresses the designed focus ring.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
export function LintCanaryFocus() {
  return (
    <button type="button" className="focus:ring-0">
      canary
    </button>
  );
}
