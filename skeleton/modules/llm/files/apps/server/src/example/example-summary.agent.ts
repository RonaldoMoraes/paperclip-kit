import { z } from "zod";
import type { Item } from "@contracts/example/item";
import type { AgentDefinition } from "../llm/agents/agent.types";

/**
 * The sample agent: one structured run summarizes the example items. It is the
 * shape `/feature` clones for any feature that calls a model — a builder that
 * turns inputs into an `AgentDefinition` whose instructions carry the fixed
 * facts, whose `outputType` is the contract the layer validates (and repairs),
 * and whose `service` names a registry route, never a vendor. The prompt text
 * is the product's to rewrite; the shape is what stays.
 */

export const EXAMPLE_SUMMARY_AGENT_NAME = "example_summary_writer";

/**
 * What a run resolves to. Every field is required on purpose: an all-required
 * object tree qualifies for OpenAI's strict json_schema (json-schema.ts), so the
 * vendor enforces the shape before the layer's Zod validation ever sees it.
 */
export const ExampleSummary = z.object({
  /** one sentence a person could read aloud */
  headline: z.string().min(1),
  /** the items worth calling out, most important first; empty when nothing stands out */
  highlights: z.array(z.string().min(1)).max(5),
  /** the one thing to do next, or "" when every item is done */
  nextStep: z.string(),
  openCount: z.number().int().min(0),
});
export type ExampleSummary = z.infer<typeof ExampleSummary>;

export interface ExampleSummaryAgentInputs {
  items: Item[];
  /** "brief" keeps the headline under ten words; "warm" lets it breathe. Default brief. */
  tone?: "brief" | "warm";
}

function itemLine(item: Item): string {
  const note = item.note ? ` — ${item.note}` : "";
  return `- [${item.done ? "done" : "open"}] ${item.title}${note}`;
}

export function buildExampleSummaryAgent(inputs: ExampleSummaryAgentInputs): AgentDefinition<ExampleSummary> {
  const tone = inputs.tone ?? "brief";
  const openCount = inputs.items.filter((item) => !item.done).length;

  const instructions = `You summarize a person's list of items so they know where they stand.

## FIXED INPUTS — facts, never outputs; do not invent, rename or drop any of them
- Items (${inputs.items.length} total, ${openCount} open):
${inputs.items.map(itemLine).join("\n") || "- (none)"}

## SHAPE RULES
- "headline": one sentence${tone === "brief" ? " of at most ten words" : ", warm but plain"}.
- "highlights": at most five items worth calling out, most important first. Quote the
  item's own title; never merge two items into one line.
- "nextStep": the one open item to do first, in the person's own words; "" when
  nothing is open.
- "openCount": exactly ${openCount}.

## JSON OUTPUT
Answer with the JSON object only.`;

  return {
    name: EXAMPLE_SUMMARY_AGENT_NAME,
    service: "example-summary",
    instructions,
    // The contract the layer validates and, once, repairs.
    outputType: ExampleSummary,
    // Structured output, no tools: one turn answers; headroom for one retry-shaped turn.
    maxTurns: 3,
  };
}
