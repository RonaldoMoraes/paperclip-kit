// Deliberately violates biome/hook-narrow-return.grit inside a hooks/ directory:
// returns the raw useQuery result.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { useQuery } from "@tanstack/react-query";

export function useLintCanary() {
  return useQuery({ queryKey: ["lint-canary"], queryFn: async () => 1 });
}
