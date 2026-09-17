// Deliberately violates biome/llm-provider-imports.grit: the bare vendor package
// and a scoped sibling (@openai/*), which the pattern must quarantine the same way.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import OpenAI from "openai";
import { Agent, run } from "@openai/agents";

export const canary = [OpenAI, Agent, run];
