// Deliberately violates biome/openai-agents-imports.grit: the SDK package and a
// scoped sibling (@openai/agents-core), imported from a providers/ file that is
// not the one sanctioned adapter — so the general vendor quarantine stays silent
// and only the agents-family rule can produce the diagnostics. Copied into the
// lint path and linted by scripts/check-lint-guards.mjs; this directory is
// excluded from the normal lint in biome.json.
import { Agent } from "@openai/agents";
import { Runner } from "@openai/agents-core";

export const canary = [Agent, Runner];
