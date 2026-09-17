// Deliberate violation for the lint-guard canary: a useMemo nothing depends on.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { useMemo } from "react";

export function LintCanary() {
  const two = useMemo(() => 1 + 1, []);
  return <span>{two}</span>;
}
