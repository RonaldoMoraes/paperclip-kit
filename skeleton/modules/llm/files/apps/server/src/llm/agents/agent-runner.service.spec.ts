import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { LlmConfig, LlmServiceConfig } from "../llm.config";
import type { LlmCallContext, LlmTelemetry } from "../llm.ports";
import { noopLlmTelemetry } from "../llm.ports";
import { LlmService } from "../llm.service";
import type { LlmProviderName, LlmTurnMessage } from "../llm.types";
import { FakeLlmProvider } from "../providers/fake.provider";
import type { LlmProviderAdapter } from "../providers/provider.types";
import { type AgentDefinition, type AgentRunEvent, type NestedAgentDefinition, agentFunctionTool } from "./agent.types";
import { AgentRunnerService } from "./agent-runner.service";

const userTurn: LlmTurnMessage[] = [{ role: "user", content: "Summarize my open items." }];

/** The runner over a real LlmService routed entirely to the fake provider — zero network, zero keys. */
function makeRunner(
  fake: FakeLlmProvider,
  telemetry: LlmTelemetry = noopLlmTelemetry,
  entry: Partial<LlmServiceConfig> = {}
): AgentRunnerService {
  const config: LlmConfig = {
    mode: "fake",
    // Single-service fixture registry; the cast stands in for the other keys of the union.
    registry: {
      "example-summary": {
        provider: "openai",
        model: "agent-model",
        maxOutputTokens: 512,
        hostedTools: true,
        ...entry,
      },
    } as LlmConfig["registry"],
    credentials: {},
  };
  const adapters = new Map<LlmProviderName, LlmProviderAdapter>([["openai", fake]]);
  return new AgentRunnerService(new LlmService(config, adapters, telemetry));
}

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return { name: "assistant", instructions: "You are the assistant.", service: "example-summary", ...overrides };
}

/** A function tool recording the validated arguments it was executed with. */
function recordingTool(name: string, respond: (args: { id: number }) => string = () => "tool says hi") {
  const executions: Array<{ id: number }> = [];
  const tool = agentFunctionTool({
    name,
    description: `Runs ${name}.`,
    parameters: z.object({ id: z.number() }),
    execute: (args) => {
      executions.push(args);
      return Promise.resolve(respond(args));
    },
  });
  return { tool, executions };
}

const toolCall = (name: string, argumentsJson: string, id = "call-1") => ({ id, name, argumentsJson });

async function collectEvents(stream: AsyncIterable<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

class RecordingTelemetry implements LlmTelemetry {
  readonly started: LlmCallContext[] = [];
  callStarted(ctx: LlmCallContext): void {
    this.started.push(ctx);
  }
  callEnded(): void {}
  structuredOutputFailed(): void {}
  errorCaptured(): void {}
}

describe("AgentRunnerService", () => {
  describe("the loop", () => {
    it("returns the final text of a no-tool turn, history appended, input untouched", async () => {
      const fake = new FakeLlmProvider();
      const runner = makeRunner(fake);
      const result = await runner.run(makeAgent(), userTurn);

      expect(result.output).toBe("[fake:agent-model] Summarize my open items.");
      expect(result.finalText).toBe(result.output);
      expect(result.turns).toBe(1);
      expect(result.history).toEqual([
        ...userTurn,
        { role: "assistant", content: "[fake:agent-model] Summarize my open items." },
      ]);
      expect(userTurn).toHaveLength(1); // caller-owned history is never mutated
      // The instructions ride as the system message of every turn, never in history.
      expect(fake.calls[0].messages[0]).toEqual({ role: "system", content: "You are the assistant." });
    });

    it("dispatches a tool call with Zod-validated arguments and replays the result to the model", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":2}')], "let me check");
      fake.enqueue("all done");
      const { tool, executions } = recordingTool("lookup_item", ({ id }) => `item ${id}`);
      const runner = makeRunner(fake);

      const result = await runner.run(makeAgent({ tools: [tool] }), userTurn);

      expect(executions).toEqual([{ id: 2 }]);
      expect(result.output).toBe("all done");
      expect(result.turns).toBe(2);
      expect(result.history.slice(1)).toEqual([
        { role: "assistant", content: "let me check", toolCalls: [toolCall("lookup_item", '{"id":2}')] },
        { role: "tool", toolCallId: "call-1", toolName: "lookup_item", content: "item 2" },
        { role: "assistant", content: "all done" },
      ]);
      // The second turn replays the whole conversation, tool traffic included.
      expect(fake.calls[1].messages).toEqual([
        { role: "system", content: "You are the assistant." },
        ...result.history.slice(0, 3),
      ]);
      // History survives a serialization round-trip — the persistence contract.
      expect(JSON.parse(JSON.stringify(result.history))).toEqual(result.history);
    });

    it("feeds an executor failure back as an isError tool result instead of crashing", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":2}')]);
      fake.enqueue("recovered");
      const tool = agentFunctionTool({
        name: "lookup_item",
        description: "Reads one item.",
        parameters: z.object({ id: z.number() }),
        execute: () => Promise.reject(new Error("upstream is down")),
      });
      const runner = makeRunner(fake);

      const result = await runner.run(makeAgent({ tools: [tool] }), userTurn);

      expect(result.output).toBe("recovered");
      expect(result.history[2]).toEqual({
        role: "tool",
        toolCallId: "call-1",
        toolName: "lookup_item",
        content: 'Tool "lookup_item" failed: upstream is down',
        isError: true,
      });
    });

    it("rejects non-JSON arguments before the executor runs", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", "not json")]);
      fake.enqueue("recovered");
      const { tool, executions } = recordingTool("lookup_item");
      const runner = makeRunner(fake);

      const result = await runner.run(makeAgent({ tools: [tool] }), userTurn);

      expect(executions).toHaveLength(0);
      expect(result.history[2]).toMatchObject({
        role: "tool",
        isError: true,
        content: expect.stringContaining("arguments are not valid JSON"),
      });
    });

    it("rejects schema-invalid arguments before the executor runs", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":"two"}')]);
      fake.enqueue("recovered");
      const { tool, executions } = recordingTool("lookup_item");
      const runner = makeRunner(fake);

      const result = await runner.run(makeAgent({ tools: [tool] }), userTurn);

      expect(executions).toHaveLength(0);
      expect(result.history[2]).toMatchObject({
        role: "tool",
        isError: true,
        content: expect.stringContaining("failed validation"),
      });
    });

    it("answers an unknown tool name with an isError result naming the known tools", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("frobnicate", "{}")]);
      fake.enqueue("recovered");
      const { tool } = recordingTool("lookup_item");
      const runner = makeRunner(fake);

      const result = await runner.run(makeAgent({ tools: [tool] }), userTurn);

      expect(result.output).toBe("recovered");
      expect(result.history[2]).toMatchObject({
        role: "tool",
        toolName: "frobnicate",
        isError: true,
        content: 'Unknown tool "frobnicate". Available tools: lookup_item.',
      });
    });

    it("throws LlmError(max_turns_exceeded) when the bound is hit without a final answer", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":1}')]);
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":2}', "call-2")]);
      const { tool, executions } = recordingTool("lookup_item");
      const runner = makeRunner(fake);

      await expect(runner.run(makeAgent({ tools: [tool], maxTurns: 2 }), userTurn)).rejects.toMatchObject({
        name: "LlmError",
        code: "max_turns_exceeded",
        message: expect.stringContaining('"assistant" used 2 turn(s)'),
      });
      expect(fake.calls).toHaveLength(2);
      expect(executions).toHaveLength(2); // both turns' tools still ran — the bound is on model turns
    });

    it("fails the run before any model call when two tools share a name", async () => {
      const fake = new FakeLlmProvider();
      const runner = makeRunner(fake);
      const agent = makeAgent({ tools: [recordingTool("lookup_item").tool, recordingTool("lookup_item").tool] });

      await expect(runner.run(agent, userTurn)).rejects.toMatchObject({
        code: "configuration",
        message: expect.stringContaining('two tools named "lookup_item"'),
      });
      expect(fake.calls).toHaveLength(0);
    });
  });

  describe('a toolChoice "required" route', () => {
    it('downgrades to "auto" after the first tool-bearing turn — required means "at least once"', async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":1}')]);
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":2}', "call-2")]);
      fake.enqueue("all done");
      const { tool } = recordingTool("lookup_item");
      const runner = makeRunner(fake, noopLlmTelemetry, { toolChoice: "required" });

      const result = await runner.run(makeAgent({ tools: [tool] }), userTurn);

      expect(result.output).toBe("all done");
      // Turn 1 carries the route's "required"; every later turn is pinned to
      // "auto" so the model is free to answer — the loop can always finish.
      expect(fake.calls.map((call) => call.toolChoice)).toEqual(["required", "auto", "auto"]);
    });

    it("keeps the route's choice standing when the first turn is already final", async () => {
      // The hosted-tool shape: the vendor runs the tool in-call and the turn
      // comes back final — there is never a tool-bearing turn to downgrade after.
      const fake = new FakeLlmProvider();
      const runner = makeRunner(fake, noopLlmTelemetry, { toolChoice: "required" });
      await runner.run(makeAgent({ tools: [{ type: "web_search" }] }), userTurn);
      expect(fake.calls.map((call) => call.toolChoice)).toEqual(["required"]);
    });
  });

  describe("nested agents", () => {
    const specialist: NestedAgentDefinition = {
      name: "specialist",
      instructions: "You are the research specialist.",
    };
    const askSpecialist = {
      type: "agent" as const,
      toolName: "ask_specialist",
      toolDescription: "Asks the research specialist.",
      agent: specialist,
    };

    it("runs a nested agent on a fresh history and returns its final text as the tool result", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("ask_specialist", '{"input":"What does the note say?"}')]);
      fake.enqueue("the specialist's take"); // nested run's final
      fake.enqueue("final answer"); // parent's final
      const runner = makeRunner(fake);

      const result = await runner.run(makeAgent({ tools: [askSpecialist] }), userTurn);

      // The nested turn carries its own instructions over a fresh history.
      expect(fake.calls[1].messages).toEqual([
        { role: "system", content: "You are the research specialist." },
        { role: "user", content: "What does the note say?" },
      ]);
      expect(result.output).toBe("final answer");
      expect(result.history[2]).toEqual({
        role: "tool",
        toolCallId: "call-1",
        toolName: "ask_specialist",
        content: "the specialist's take",
      });
    });

    it("feeds a failed nested run back as an isError tool result", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("ask_specialist", '{"input":"hi"}')]);
      // The nested agent (maxTurns 1) burns its only turn on a tool call it cannot resolve.
      fake.enqueueToolCalls([toolCall("nonexistent", "{}", "call-2")]);
      fake.enqueue("recovered");
      const runner = makeRunner(fake);
      const bounded = { ...askSpecialist, agent: { ...specialist, maxTurns: 1 } };

      const result = await runner.run(makeAgent({ tools: [bounded] }), userTurn);

      expect(result.output).toBe("recovered");
      expect(result.history[2]).toMatchObject({
        role: "tool",
        toolName: "ask_specialist",
        isError: true,
        content: expect.stringContaining("used 1 turn(s)"),
      });
    });

    it("aggregates usage across the parent's turns and the nested run", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("ask_specialist", '{"input":"What does the note say?"}')]);
      fake.enqueue("the specialist's take");
      fake.enqueue("final answer");
      const runner = makeRunner(fake);

      const events = await collectEvents(runner.runStream(makeAgent({ tools: [askSpecialist] }), userTurn));

      const turnUsages = events
        .filter((event): event is Extract<AgentRunEvent, { type: "turn_completed" }> => event.type === "turn_completed")
        .map((event) => event.usage);
      expect(turnUsages).toHaveLength(3); // parent turn, nested turn, parent final turn
      const completed = events.at(-1);
      if (completed?.type !== "run_completed") throw new Error("expected run_completed");
      expect(completed.result.usage).toEqual({
        inputTokens: turnUsages.reduce((sum, usage) => sum + (usage.inputTokens ?? 0), 0),
        outputTokens: turnUsages.reduce((sum, usage) => sum + (usage.outputTokens ?? 0), 0),
      });
      expect(completed.result.usage.inputTokens).toBeGreaterThan(0);
    });
  });

  describe("structured final output", () => {
    const scoreSchema = z.object({ score: z.number() });

    it("steers every turn to JSON with the strict schema and returns the parsed value", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue('{"score":7}');
      const runner = makeRunner(fake);

      const result = await runner.run({ ...makeAgent(), outputType: scoreSchema }, userTurn);

      expect(result.output).toEqual({ score: 7 });
      expect(result.finalText).toBe('{"score":7}');
      expect(result.history.at(-1)).toEqual({ role: "assistant", content: '{"score":7}' });
      expect(fake.calls[0].responseFormat).toBe("json");
      expect(fake.calls[0].jsonSchema).toEqual({
        name: "final_output",
        schema: {
          type: "object",
          properties: { score: { type: "number" } },
          required: ["score"],
          additionalProperties: false,
        },
      });
    });

    it("keeps JSON steering without a strict schema when the schema does not qualify", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue('{"score":7}');
      const runner = makeRunner(fake);

      await runner.run({ ...makeAgent(), outputType: z.object({ score: z.number().optional() }) }, userTurn);

      expect(fake.calls[0].responseFormat).toBe("json");
      expect(fake.calls[0].jsonSchema).toBeUndefined();
    });

    it("cleans a fenced final answer without spending a repair call", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue('```json\n{"score":7}\n```');
      const runner = makeRunner(fake);

      const result = await runner.run({ ...makeAgent(), outputType: scoreSchema }, userTurn);

      expect(result.output).toEqual({ score: 7 });
      expect(result.finalText).toBe('{"score":7}'); // history carries the cleaned text
      expect(fake.calls).toHaveLength(1);
    });

    it("repairs an invalid final through the layer's structured machinery", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue("not json at all");
      fake.enqueue('{"score":9}'); // consumed by the repair call
      const runner = makeRunner(fake);

      const result = await runner.run({ ...makeAgent(), outputType: scoreSchema }, userTurn);

      expect(result.output).toEqual({ score: 9 });
      expect(result.finalText).toBe('{"score":9}');
      expect(fake.calls).toHaveLength(2);
      // The repair call is the layer's own repair conversation, strict schema included.
      expect(fake.calls[1].responseFormat).toBe("json");
      expect(fake.calls[1].messages[0].content).toContain("repair");
      expect(fake.calls[1].messages[1].content).toContain("not json at all");
    });

    it("throws invalid_structured_output when the repair is exhausted too", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue("still not json");
      // The repair call runs unscripted: the fake's "{}" default fails the schema on every attempt.
      const runner = makeRunner(fake);

      await expect(runner.run({ ...makeAgent(), outputType: scoreSchema }, userTurn)).rejects.toMatchObject({
        name: "LlmError",
        code: "invalid_structured_output",
      });
    });
  });

  describe("abort", () => {
    it("rejects with LlmError(aborted) when the signal is already aborted", async () => {
      const fake = new FakeLlmProvider();
      const runner = makeRunner(fake);
      const abort = new AbortController();
      abort.abort();

      await expect(runner.run(makeAgent(), userTurn, { signal: abort.signal })).rejects.toMatchObject({
        code: "aborted",
      });
      expect(fake.calls).toHaveLength(0);
    });

    it("stops dispatching tool calls once the signal fires mid-loop", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("first", "{}"), toolCall("second", "{}", "call-2")]);
      const abort = new AbortController();
      const secondExecutions: unknown[] = [];
      const first = agentFunctionTool({
        name: "first",
        description: "Aborts the run.",
        parameters: z.object({}),
        execute: () => {
          abort.abort();
          return Promise.resolve("done");
        },
      });
      const second = agentFunctionTool({
        name: "second",
        description: "Never runs.",
        parameters: z.object({}),
        execute: (args) => {
          secondExecutions.push(args);
          return Promise.resolve("never");
        },
      });
      const runner = makeRunner(fake);

      await expect(
        runner.run(makeAgent({ tools: [first, second] }), userTurn, { signal: abort.signal })
      ).rejects.toMatchObject({ code: "aborted" });
      expect(secondExecutions).toHaveLength(0);
    });
  });

  describe("runStream", () => {
    it("yields the loop's progress, one final delta and run_completed, in order", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":2}')]);
      fake.enqueue("all done");
      const { tool } = recordingTool("lookup_item");
      const runner = makeRunner(fake);

      const events = await collectEvents(runner.runStream(makeAgent({ tools: [tool] }), userTurn));

      expect(events.map((event) => event.type)).toEqual([
        "run_started",
        "turn_started",
        "turn_completed",
        "tool_call_started",
        "tool_call_completed",
        "turn_started",
        "turn_completed",
        "final_delta",
        "run_completed",
      ]);
      expect(events[2]).toMatchObject({ outcome: "tool_calls", model: "agent-model" });
      expect(events[3]).toMatchObject({ toolName: "lookup_item", toolCallId: "call-1" });
      expect(events[4]).toMatchObject({ isError: false });
      expect(events[6]).toMatchObject({ outcome: "final" });
      expect(events[7]).toMatchObject({ agent: "assistant", text: "all done" });
      const completed = events.at(-1);
      if (completed?.type !== "run_completed") throw new Error("expected run_completed");
      expect(completed.result.output).toBe("all done");
    });

    it("forwards nested progress with boundaries, and only the root emits final_delta", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("ask_specialist", '{"input":"hi"}')]);
      fake.enqueue("the specialist's take");
      fake.enqueue("final answer");
      const specialistTool = {
        type: "agent" as const,
        toolName: "ask_specialist",
        toolDescription: "Asks the specialist.",
        agent: { name: "specialist", instructions: "You are the research specialist." },
      };
      const runner = makeRunner(fake);

      const events = await collectEvents(runner.runStream(makeAgent({ tools: [specialistTool] }), userTurn));

      expect(events.map((event) => `${event.type}:${"agent" in event ? event.agent : ""}`)).toEqual([
        "run_started:assistant",
        "turn_started:assistant",
        "turn_completed:assistant",
        "tool_call_started:assistant",
        "nested_run_started:specialist",
        "turn_started:specialist",
        "turn_completed:specialist",
        "nested_run_completed:specialist",
        "tool_call_completed:assistant",
        "turn_started:assistant",
        "turn_completed:assistant",
        "final_delta:assistant",
        "run_completed:assistant",
      ]);
      const nestedCompleted = events[7];
      if (nestedCompleted?.type !== "nested_run_completed") throw new Error("expected nested_run_completed");
      expect(nestedCompleted).toMatchObject({ parent: "assistant", isError: false });
      expect(nestedCompleted.usage.outputTokens).toBeGreaterThan(0);
    });

    it("ends quietly on abort — no run_completed, no throw", async () => {
      const fake = new FakeLlmProvider();
      const runner = makeRunner(fake);
      const abort = new AbortController();
      abort.abort();

      const events = await collectEvents(runner.runStream(makeAgent(), userTurn, { signal: abort.signal }));

      expect(events.map((event) => event.type)).toEqual(["run_started", "turn_started"]);
    });

    it("throws a terminal LlmError from the iterator like the layer's stream path", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueError("other");
      fake.enqueueError("other");
      fake.enqueueError("other"); // exhausts the route's attempt loop
      const runner = makeRunner(fake);

      await expect(collectEvents(runner.runStream(makeAgent(), userTurn))).rejects.toMatchObject({
        name: "LlmError",
        code: "provider_error",
      });
    });
  });

  describe("telemetry correlation", () => {
    it("forwards referenceId to every loop step, each step under its own requestId", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([toolCall("lookup_item", '{"id":1}')]);
      fake.enqueue("all done");
      const telemetry = new RecordingTelemetry();
      const { tool } = recordingTool("lookup_item");
      const runner = makeRunner(fake, telemetry);

      await runner.run(makeAgent({ tools: [tool] }), userTurn, { referenceId: "conversation-42" });

      expect(telemetry.started).toHaveLength(2);
      expect(telemetry.started.every((ctx) => ctx.referenceId === "conversation-42")).toBe(true);
      expect(telemetry.started.every((ctx) => ctx.mode === "turn")).toBe(true);
      // One requestId per loop step: (referenceId, requestId, attempt) tells the steps apart.
      expect(new Set(telemetry.started.map((ctx) => ctx.requestId)).size).toBe(2);
    });
  });
});
