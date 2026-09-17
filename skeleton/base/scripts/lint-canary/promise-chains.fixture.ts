// Deliberately violates biome/promise-chains.grit: a two-step .then chain.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
export function lintCanaryChain(): Promise<number> {
  return Promise.resolve(1)
    .then((n) => n + 1)
    .then((n) => n * 2);
}
