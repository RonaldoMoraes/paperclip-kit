// Deliberately violates biome/analytics-provider-imports.grit.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { MongoClient, ObjectId } from "mongodb";

export const canary = [MongoClient, ObjectId];
