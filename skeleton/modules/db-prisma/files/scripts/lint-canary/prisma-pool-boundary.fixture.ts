// Deliberately violates biome/prisma-pool-boundary.grit: the adapter imported outside
// apps/server/src/database/ (and outside db/prisma/). Multi-specifier on purpose — that is
// the clause shape a snippet pattern silently lets through.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { PrismaPg, type PrismaPgOptions } from "@prisma/adapter-pg";

export const canary: Array<typeof PrismaPg | PrismaPgOptions> = [PrismaPg];
