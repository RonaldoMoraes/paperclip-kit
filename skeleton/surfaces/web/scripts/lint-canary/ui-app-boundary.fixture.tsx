// Deliberately violates biome/ui-app-boundary.grit inside shared/ui: a
// multi-specifier runtime import from the apps/web `~/` alias (the clause shape
// that silently escaped the original snippet pattern).
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { cn, formatDate } from "~/lib/utils";

export function LintCanaryUi() {
  return <span className={cn("p-2")}>{formatDate(new Date())}</span>;
}
