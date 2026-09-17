// Deliberately violates biome/design-system.grit: arbitrary hex color, transition-all
// and a display-sized px class — one violation per class string, because the plugin's
// `or` short-circuits and reports only the first matching rule per literal.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
export function LintCanaryDesign() {
  return (
    <div className="bg-[#ff0000]">
      <span className="transition-all">canary</span>
      <span className="text-[32px]">canary</span>
    </div>
  );
}
