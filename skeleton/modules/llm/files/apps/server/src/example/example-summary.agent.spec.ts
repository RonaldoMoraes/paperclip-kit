import { describe, expect, it } from "vitest";
import type { Item } from "@contracts/example/item";
import { AgentRunnerService } from "../llm/agents/agent-runner.service";
import type { LlmConfig } from "../llm/llm.config";
import { noopLlmTelemetry } from "../llm/llm.ports";
import { LlmService } from "../llm/llm.service";
import type { LlmProviderName } from "../llm/llm.types";
import { FakeLlmProvider } from "../llm/providers/fake.provider";
import type { LlmProviderAdapter } from "../llm/providers/provider.types";
import { EXAMPLE_SUMMARY_AGENT_NAME, ExampleSummary, buildExampleSummaryAgent } from "./example-summary.agent";

const ITEMS: Item[] = [
  { id: "one", title: "Renew the domain", note: "expires Friday", done: false, updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "two", title: "Write the changelog", note: "", done: true, updatedAt: "2026-01-02T00:00:00.000Z" },
];

const SUMMARY: ExampleSummary = {
  headline: "One item left: renew the domain.",
  highlights: ["Renew the domain"],
  nextStep: "Renew the domain",
  openCount: 1,
};

/** The stack a feature gets from LlmModule, built by hand over the fake — zero keys, zero network. */
function makeRunner(fake: FakeLlmProvider): AgentRunnerService {
  const config: LlmConfig = {
    mode: "fake",
    // The shipped registry routes both services to openai; one fake serves them all.
    registry: {
      "example-summary": { provider: "openai", model: "summary-model", maxOutputTokens: 512 },
      "example-chat": { provider: "openai", model: "chat-model", maxOutputTokens: 512 },
    },
    credentials: {},
  };
  const adapters = new Map<LlmProviderName, LlmProviderAdapter>([["openai", fake]]);
  return new AgentRunnerService(new LlmService(config, adapters, noopLlmTelemetry));
}

describe("buildExampleSummaryAgent", () => {
  it("names the registry route, carries every item as a fixed input and the schema as the contract", () => {
    const agent = buildExampleSummaryAgent({ items: ITEMS });

    expect(agent.name).toBe(EXAMPLE_SUMMARY_AGENT_NAME);
    expect(agent.service).toBe("example-summary");
    expect(agent.outputType).toBe(ExampleSummary);
    expect(agent.instructions).toContain("- [open] Renew the domain — expires Friday");
    expect(agent.instructions).toContain("- [done] Write the changelog");
    expect(agent.instructions).toContain('"openCount": exactly 1.');
    expect(agent.instructions).toContain("at most ten words");
  });

  it("writes the empty list and the warm tone into the instructions", () => {
    const agent = buildExampleSummaryAgent({ items: [], tone: "warm" });
    expect(agent.instructions).toContain("- (none)");
    expect(agent.instructions).toContain("warm but plain");
    expect(agent.instructions).toContain('"openCount": exactly 0.');
  });

  it("resolves a run to the validated summary, steering the model to the strict schema", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueue(JSON.stringify(SUMMARY));
    const runner = makeRunner(fake);

    const result = await runner.run(buildExampleSummaryAgent({ items: ITEMS }), [
      { role: "user", content: "Where do I stand?" },
    ]);

    expect(result.output).toEqual(SUMMARY);
    expect(result.turns).toBe(1);
    expect(fake.calls[0]).toMatchObject({ model: "summary-model", responseFormat: "json" });
    expect(fake.calls[0].jsonSchema?.schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(fake.calls[0].messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("FIXED INPUTS"),
    });
  });

  it("repairs a malformed answer through the layer's machinery instead of failing the feature", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueue('{"headline": "One item left."}'); // schema-mismatch: three fields missing
    fake.enqueue(JSON.stringify(SUMMARY)); // consumed by the one repair call
    const runner = makeRunner(fake);

    const result = await runner.run(buildExampleSummaryAgent({ items: ITEMS }), [
      { role: "user", content: "Where do I stand?" },
    ]);

    expect(result.output).toEqual(SUMMARY);
    expect(fake.calls).toHaveLength(2);
  });
});
