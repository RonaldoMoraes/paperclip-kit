/**
 * The AgentRunner port's behavioral claims, run against BOTH runtimes — the
 * native loop (AgentRunnerService over the fake provider) and the opt-in
 * OpenAI Agents SDK adapter (OpenAiAgentsService over a scripted SDK Model
 * injected through its ModelProvider seam) — so the port's semantics cannot
 * drift between engines. Neither harness touches the network or needs a key.
 *
 * Named gaps — port claims NOT asserted identically against both runtimes:
 *
 * 1. Tool traffic in the returned history. The port promises "the caller's
 *    history plus everything the run appended"; the native runner appends the
 *    assistant tool-call and tool-result messages, but the SDK adapter returns
 *    only [...history, final assistant message] — the SDK keeps its loop in its
 *    own item format and the adapter does not translate it back. The shared
 *    claim below asserts the invariants both honor (input never mutated, prefix
 *    preserved, final appended, serializable); the full round-trip is asserted
 *    native-side in agent-runner.service.spec.ts. Known adapter deviation.
 * 2. The isError flag on a failed tool result. Native surfaces it on the
 *    history's tool message; the SDK protocol has no error bit, so through the
 *    adapter the failure semantics are asserted as what the port actually
 *    guarantees the model sees: the failure text replayed on the next turn,
 *    never a crash.
 * 3. Streaming progress events. The port's runStream vocabulary includes
 *    per-turn and per-tool events; the SDK adapter emits a synthetic
 *    single-turn envelope (run_started → turn_started → turn_completed →
 *    final_delta → run_completed) because the SDK loop is opaque. Only the
 *    envelope and the abort contract are asserted for both.
 * 4. Telemetry granularity. Native reports one callStarted/callEnded pair per
 *    model turn (through LlmService); the SDK adapter brackets the whole run
 *    in one pair. The shared claim asserts what the port promises the caller:
 *    the run reports through LLM_TELEMETRY carrying the referenceId.
 * 5. Nested agents. Covered natively in agent-runner.service.spec.ts; not
 *    asserted through the SDK here because the adapter routes nested agents on
 *    the parent's model and ignores a nested `service` route — a reported
 *    adapter deviation that would make a shared claim assert the wrong thing.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { LlmConfig } from "../llm.config";
import type { LlmCallContext, LlmCallOutcome, LlmTelemetry } from "../llm.ports";
import { LlmService } from "../llm.service";
import { LlmError, type LlmProviderName, type LlmTurnMessage } from "../llm.types";
import { FakeLlmProvider } from "../providers/fake.provider";
import type { Model, ModelRequest, ModelResponse } from "../providers/openai-agents.service";
import { OpenAiAgentsService } from "../providers/openai-agents.service";
import type { LlmProviderAdapter } from "../providers/provider.types";
import { type AgentDefinition, type AgentRunEvent, type AgentRunner, agentFunctionTool } from "./agent.types";
import { AgentRunnerService } from "./agent-runner.service";

/** What both harnesses expose: the runner under test plus scripting and observation seams. */
interface RuntimeHarness {
  runner: AgentRunner;
  telemetry: RecordingTelemetry;
  /** Scripts the next model turn to answer with final text. */
  scriptFinal(text: string): void;
  /** Scripts the next model turn to request one function-tool call. */
  scriptToolCall(name: string, argumentsJson: string, callId?: string): void;
  /** Everything the runtime sent the model on its nth call (0-based), as searchable text. */
  modelInputOf(call: number): string;
  modelCallCount(): number;
}

class RecordingTelemetry implements LlmTelemetry {
  readonly started: LlmCallContext[] = [];
  readonly ended: Array<{ ctx: LlmCallContext; outcome: LlmCallOutcome }> = [];
  callStarted(ctx: LlmCallContext): void {
    this.started.push(ctx);
  }
  callEnded(ctx: LlmCallContext, outcome: LlmCallOutcome): void {
    this.ended.push({ ctx, outcome });
  }
  structuredOutputFailed(): void {}
  errorCaptured(): void {}
}

// Single-service fixture registry; the cast stands in for the other keys of the union.
const registry = {
  "example-summary": { provider: "openai", model: "conformance-model", maxOutputTokens: 512 },
} as LlmConfig["registry"];

function nativeHarness(): RuntimeHarness {
  const fake = new FakeLlmProvider();
  const telemetry = new RecordingTelemetry();
  const config: LlmConfig = { mode: "fake", registry, credentials: {} };
  const adapters = new Map<LlmProviderName, LlmProviderAdapter>([["openai", fake]]);
  return {
    runner: new AgentRunnerService(new LlmService(config, adapters, telemetry)),
    telemetry,
    scriptFinal: (text) => fake.enqueue(text),
    scriptToolCall: (name, argumentsJson, callId = "call-1") =>
      fake.enqueueToolCalls([{ id: callId, name, argumentsJson }]),
    modelInputOf: (call) => JSON.stringify(fake.calls[call]?.messages ?? []),
    modelCallCount: () => fake.calls.length,
  };
}

// The SDK loop only reads and sums these fields (Usage.add is duck-typed), so a
// literal stands in for the SDK's Usage class; the cast only drops the class's methods.
const sdkUsage = (): ModelResponse["usage"] =>
  ({
    requests: 1,
    inputTokens: 7,
    outputTokens: 3,
    totalTokens: 10,
    inputTokensDetails: [],
    outputTokensDetails: [],
  }) as ModelResponse["usage"];

const sdkFinal = (text: string): ModelResponse => ({
  usage: sdkUsage(),
  output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] }],
});

const sdkToolCall = (name: string, argumentsJson: string, callId: string): ModelResponse => ({
  usage: sdkUsage(),
  output: [{ type: "function_call", callId, name, arguments: argumentsJson, status: "completed" }],
});

/** A scripted SDK Model: FIFO responses, every request recorded — the fake provider's role, one seam deeper. */
class ScriptedSdkModel implements Model {
  readonly requests: ModelRequest[] = [];
  private readonly queue: ModelResponse[] = [];

  script(response: ModelResponse): void {
    this.queue.push(response);
  }

  getResponse(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) return Promise.reject(new Error("[conformance] scripted model queue is empty"));
    return Promise.resolve(next);
  }

  getStreamedResponse(): AsyncIterable<never> {
    throw new Error("[conformance] the runtimes under test never stream through the SDK model");
  }
}

function sdkHarness(): RuntimeHarness {
  const model = new ScriptedSdkModel();
  const telemetry = new RecordingTelemetry();
  return {
    runner: new OpenAiAgentsService({ registry }, telemetry, { getModel: () => model }),
    telemetry,
    scriptFinal: (text) => model.script(sdkFinal(text)),
    scriptToolCall: (name, argumentsJson, callId = "call-1") => model.script(sdkToolCall(name, argumentsJson, callId)),
    modelInputOf: (call) => JSON.stringify(model.requests[call]?.input ?? []),
    modelCallCount: () => model.requests.length,
  };
}

const agent = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
  name: "conformance",
  instructions: "You are under test.",
  service: "example-summary",
  ...overrides,
});

const history = (): LlmTurnMessage[] => [{ role: "user", content: "hello" }];

/** A tool recording the validated arguments it ran with. */
function recordingTool(respond: (args: { id: number }) => Promise<string>) {
  const executions: Array<{ id: number }> = [];
  const tool = agentFunctionTool({
    name: "lookup_item",
    description: "Looks up one item.",
    parameters: z.object({ id: z.number() }),
    execute: (args) => {
      executions.push(args);
      return respond(args);
    },
  });
  return { tool, executions };
}

async function collectEvents(stream: AsyncIterable<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const runtimes: Array<[string, () => RuntimeHarness]> = [
  ["native (AgentRunnerService)", nativeHarness],
  ["openai-agents (OpenAiAgentsService)", sdkHarness],
];

describe.each(runtimes)("AgentRunner conformance — %s", (_name, makeHarness) => {
  it("resolves a single-turn run to the model's final answer, with usage and one turn", async () => {
    const h = makeHarness();
    h.scriptFinal("the final answer");

    const result = await h.runner.run(agent(), history());

    expect(result.output).toBe("the final answer");
    expect(result.finalText).toBe("the final answer");
    expect(result.turns).toBe(1);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it("dispatches a function tool with validated arguments and replays its result to the model", async () => {
    const h = makeHarness();
    const { tool, executions } = recordingTool(({ id }) => Promise.resolve(`item ${id}`));
    h.scriptToolCall("lookup_item", '{"id":2}');
    h.scriptFinal("all done");

    const result = await h.runner.run(agent({ tools: [tool] }), history());

    expect(executions).toEqual([{ id: 2 }]);
    expect(result.output).toBe("all done");
    expect(h.modelCallCount()).toBe(2);
    expect(h.modelInputOf(1)).toContain("item 2");
  });

  it("feeds a throwing tool back to the model as a failure result instead of crashing the run", async () => {
    const h = makeHarness();
    const { tool } = recordingTool(() => Promise.reject(new Error("upstream exploded")));
    h.scriptToolCall("lookup_item", '{"id":2}');
    h.scriptFinal("recovered");

    const result = await h.runner.run(agent({ tools: [tool] }), history());

    expect(result.output).toBe("recovered");
    expect(h.modelInputOf(1)).toContain("lookup_item");
    expect(h.modelInputOf(1)).toContain("failed: upstream exploded");
  });

  it('rejects an already-aborted run with LlmError("aborted")', async () => {
    const h = makeHarness();
    const controller = new AbortController();
    controller.abort();

    const error = await h.runner.run(agent(), history(), { signal: controller.signal }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).code).toBe("aborted");
  });

  it("ends runStream quietly on abort — no run_completed, no throw", async () => {
    const h = makeHarness();
    const controller = new AbortController();
    controller.abort();

    const events = await collectEvents(h.runner.runStream(agent(), history(), { signal: controller.signal }));

    expect(events[0]).toEqual({ type: "run_started", agent: "conformance" });
    expect(events.some((event) => event.type === "run_completed")).toBe(false);
  });

  it('fails a run that never reaches a final answer with LlmError("max_turns_exceeded")', async () => {
    const h = makeHarness();
    const { tool } = recordingTool(() => Promise.resolve("still going"));
    for (const callId of ["call-1", "call-2", "call-3", "call-4"]) {
      h.scriptToolCall("lookup_item", '{"id":1}', callId);
    }

    const error = await h.runner.run(agent({ tools: [tool], maxTurns: 2 }), history()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).code).toBe("max_turns_exceeded");
  });

  it("returns the caller's history untouched, prefix preserved, final assistant message appended", async () => {
    const h = makeHarness();
    h.scriptFinal("the end");
    const input = history();

    const result = await h.runner.run(agent(), input);

    expect(input).toEqual(history()); // caller-owned history is never mutated
    expect(result.history.slice(0, input.length)).toEqual(input);
    expect(result.history.at(-1)).toEqual({ role: "assistant", content: "the end" });
    // History survives a serialization round-trip — the persistence contract.
    expect(JSON.parse(JSON.stringify(result.history))).toEqual(result.history);
  });

  it("reports the run through the LLM telemetry port, carrying the caller's referenceId", async () => {
    const h = makeHarness();
    h.scriptFinal("done");

    await h.runner.run(agent(), history(), { referenceId: "ref-123" });

    expect(h.telemetry.started.length).toBeGreaterThanOrEqual(1);
    for (const ctx of h.telemetry.started) {
      expect(ctx.referenceId).toBe("ref-123");
      expect(ctx.service).toBe("example-summary");
    }
    expect(h.telemetry.ended).toHaveLength(h.telemetry.started.length);
    for (const { outcome } of h.telemetry.ended) {
      expect(outcome.status).toBe("success");
    }
  });
});
