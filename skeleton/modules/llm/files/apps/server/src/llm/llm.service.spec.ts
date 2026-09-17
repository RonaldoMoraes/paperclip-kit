import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { LlmConfig, LlmRouteConfig, LlmServiceConfig } from "./llm.config";
import type { LlmCallContext, LlmCallOutcome, LlmTelemetry } from "./llm.ports";
import { noopLlmTelemetry } from "./llm.ports";
import { LlmService } from "./llm.service";
import {
  LlmError,
  type LlmFunctionTool,
  type LlmMessage,
  type LlmProviderName,
  type LlmStreamChunk,
} from "./llm.types";
import { FakeLlmProvider } from "./providers/fake.provider";
import type {
  LlmProviderAdapter,
  ProviderCallSettings,
  ProviderErrorCategory,
  ProviderResult,
  ProviderStreamEvent,
} from "./providers/provider.types";

const messages: LlmMessage[] = [
  { role: "system", content: "You are the assistant." },
  { role: "user", content: "Summarize my open items." },
];

function makeService(
  adapter: LlmProviderAdapter,
  options: {
    telemetry?: LlmTelemetry;
    entry?: Partial<LlmServiceConfig>;
    /** Wires a one-entry failover chain: primary on "anthropic", fallback on "openai" (both overridable). */
    fallback?: { adapter: LlmProviderAdapter; entry?: Partial<LlmRouteConfig> };
  } = {}
): LlmService {
  const entry: LlmServiceConfig = {
    provider: "anthropic",
    model: "primary-model",
    maxOutputTokens: 512,
    ...options.entry,
  };
  const adapters = new Map<LlmProviderName, LlmProviderAdapter>([[entry.provider, adapter]]);
  if (options.fallback) {
    const fallbackEntry: LlmRouteConfig = {
      provider: "openai",
      model: "fallback-model",
      maxOutputTokens: 256,
      ...options.fallback.entry,
    };
    adapters.set(fallbackEntry.provider, options.fallback.adapter);
    entry.fallbacks = [fallbackEntry];
  }
  // Single-service fixture registry; the cast stands in for the other keys of the union.
  const config: LlmConfig = {
    mode: "fake",
    registry: { "example-summary": entry } as LlmConfig["registry"],
    credentials: {},
  };
  return new LlmService(config, adapters, options.telemetry ?? noopLlmTelemetry);
}

/** Scriptable port double for outcomes the deterministic fake never produces. */
class StubAdapter implements LlmProviderAdapter {
  readonly calls: ProviderCallSettings[] = [];
  private readonly completions: Array<ProviderResult | Error> = [];
  private streamEvents: Array<ProviderStreamEvent | Error> = [];

  constructor(readonly name: LlmProviderName = "fake") {}

  script(...results: Array<ProviderResult | Error>): void {
    this.completions.push(...results);
  }

  scriptStream(...events: Array<ProviderStreamEvent | Error>): void {
    this.streamEvents = events;
  }

  complete(settings: ProviderCallSettings): Promise<ProviderResult> {
    this.calls.push(settings);
    const next = this.completions.shift();
    if (!next) return Promise.reject(new Error("StubAdapter: nothing scripted"));
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  }

  async *stream(settings: ProviderCallSettings): AsyncIterable<ProviderStreamEvent> {
    this.calls.push(settings);
    for (const event of this.streamEvents) {
      if (event instanceof Error) throw event;
      yield event;
    }
  }

  classifyError(error: unknown): ProviderErrorCategory {
    return (error as { category?: ProviderErrorCategory }).category ?? "other";
  }
}

const ok = (text: string): ProviderResult => ({
  text,
  usage: { inputTokens: 10, outputTokens: 5 },
  finishReason: "stop",
});
const truncated = (text: string): ProviderResult => ({ ...ok(text), finishReason: "length" });
/** An error the StubAdapter classifies into the given category. */
const categorized = (category: ProviderErrorCategory, message = `stub ${category} failure`): Error =>
  Object.assign(new Error(message), { category });

type TelemetryEvent =
  | { type: "started"; ctx: LlmCallContext }
  | { type: "ended"; ctx: LlmCallContext; outcome: LlmCallOutcome }
  | {
      type: "structured-failed";
      ctx: LlmCallContext;
      failure: { kind: string; detail: string; contentPreview: string };
    }
  | { type: "error"; ctx: LlmCallContext; error: unknown };

class RecordingTelemetry implements LlmTelemetry {
  readonly events: TelemetryEvent[] = [];
  callStarted(ctx: LlmCallContext): void {
    this.events.push({ type: "started", ctx });
  }
  callEnded(ctx: LlmCallContext, outcome: LlmCallOutcome): void {
    this.events.push({ type: "ended", ctx, outcome });
  }
  structuredOutputFailed(ctx: LlmCallContext, failure: { kind: string; detail: string; contentPreview: string }): void {
    this.events.push({ type: "structured-failed", ctx, failure });
  }
  errorCaptured(ctx: LlmCallContext, error: unknown): void {
    this.events.push({ type: "error", ctx, error });
  }
}

async function collect(stream: AsyncIterable<LlmStreamChunk>): Promise<LlmStreamChunk[]> {
  const chunks: LlmStreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

const scoreSchema = z.object({ score: z.number() });

describe("LlmService", () => {
  describe("registry resolution", () => {
    it("routes a service to its configured provider settings", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { temperature: 0.3 } });
      await service.processPrompt({ service: "example-summary", messages });
      expect(fake.calls[0]).toEqual({
        model: "primary-model",
        messages,
        maxOutputTokens: 512,
        temperature: 0.3,
        responseFormat: "text",
      });
    });

    it("lets overrides win field-by-field", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { temperature: 0.3 } });
      await service.processPrompt({
        service: "example-summary",
        messages,
        overrides: { model: "other-model", maxOutputTokens: 64 },
      });
      expect(fake.calls[0]).toMatchObject({ model: "other-model", maxOutputTokens: 64, temperature: 0.3 });
    });

    it("omits temperature when neither the registry nor overrides set it", async () => {
      const fake = new FakeLlmProvider();
      await makeService(fake).processPrompt({ service: "example-summary", messages });
      expect("temperature" in fake.calls[0]).toBe(false);
    });

    it("threads the registry's reasoning knobs into the provider settings, and omits them when unset", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { reasoningEffort: "low", textVerbosity: "low" } });
      await service.processPrompt({ service: "example-summary", messages });
      expect(fake.calls[0]).toMatchObject({ reasoningEffort: "low", textVerbosity: "low" });

      const bare = new FakeLlmProvider();
      await makeService(bare).processPrompt({ service: "example-summary", messages });
      expect("reasoningEffort" in bare.calls[0]).toBe(false);
      expect("textVerbosity" in bare.calls[0]).toBe(false);
    });
  });

  describe("processPrompt", () => {
    it("returns the provider text on the happy path", async () => {
      const service = makeService(new FakeLlmProvider());
      await expect(service.processPrompt({ service: "example-summary", messages })).resolves.toBe(
        "[fake:primary-model] Summarize my open items."
      );
    });

    it("retries a truncated response and returns the good one", async () => {
      const stub = new StubAdapter();
      stub.script(truncated("cut off mid-"), ok("full answer"));
      const service = makeService(stub);
      await expect(service.processPrompt({ service: "example-summary", messages })).resolves.toBe("full answer");
      expect(stub.calls).toHaveLength(2);
    });

    it("throws LlmError(provider_error) with the cause after exhausting retries", async () => {
      const stub = new StubAdapter();
      const vendorError = new Error("vendor 500");
      stub.script(vendorError, vendorError, vendorError);
      const service = makeService(stub);
      const rejection = await service.processPrompt({ service: "example-summary", messages }).then(
        () => null,
        (error: unknown) => error
      );
      expect(rejection).toBeInstanceOf(LlmError);
      expect((rejection as LlmError).code).toBe("provider_error");
      expect((rejection as LlmError).cause).toBe(vendorError);
      expect(stub.calls).toHaveLength(3);
    });

    it("throws LlmError(empty_response) when the vendor keeps answering with no text", async () => {
      const stub = new StubAdapter();
      stub.script(ok(""), ok(""), ok(""));
      const service = makeService(stub);
      await expect(service.processPrompt({ service: "example-summary", messages })).rejects.toMatchObject({
        name: "LlmError",
        code: "empty_response",
      });
    });
  });

  describe("processStructuredPrompt", () => {
    it("parses a valid response to T", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue(JSON.stringify({ score: 5 }));
      const service = makeService(fake);
      await expect(
        service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema })
      ).resolves.toEqual({ score: 5 });
      expect(fake.calls[0].responseFormat).toBe("json");
    });

    it("cleans markdown-fenced JSON before parsing", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue('```json\n{"score": 5}\n```');
      const service = makeService(fake);
      await expect(
        service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema })
      ).resolves.toEqual({ score: 5 });
    });

    it("issues a repair call carrying the invalid output and returns the repaired value", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue("this is not json at all");
      fake.enqueue(JSON.stringify({ score: 7 }));
      const service = makeService(fake);
      await expect(
        service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema })
      ).resolves.toEqual({ score: 7 });

      expect(fake.calls).toHaveLength(2);
      const repair = fake.calls[1];
      expect(repair.messages[0].role).toBe("system");
      expect(repair.messages[0].content).toContain("You repair malformed LLM outputs");
      expect(repair.messages[1].content).toContain("this is not json at all");
      expect(repair.messages[1].content).toContain("Summarize my open items.");
    });

    it("throws LlmError(invalid_structured_output) when attempts and repairs are exhausted", async () => {
      // Unscripted json calls return "{}", which fails the schema every time.
      const fake = new FakeLlmProvider();
      const service = makeService(fake);
      await expect(
        service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema })
      ).rejects.toMatchObject({ name: "LlmError", code: "invalid_structured_output" });
      // 3 main attempts + exactly 1 repair — an invalid repair never recurses.
      expect(fake.calls).toHaveLength(4);
    });

    it("honors maxRepairAttempts: 0 by never issuing a repair call", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake);
      await expect(
        service.processStructuredPrompt({
          service: "example-summary",
          messages,
          schema: scoreSchema,
          maxRepairAttempts: 0,
        })
      ).rejects.toMatchObject({ code: "invalid_structured_output" });
      expect(fake.calls).toHaveLength(3);
    });

    it("sends the derived strict json_schema when the Zod schema qualifies", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue(JSON.stringify({ score: 5 }));
      const service = makeService(fake);
      await service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema });
      expect(fake.calls[0].jsonSchema).toEqual({
        name: "structured_output",
        schema: {
          type: "object",
          properties: { score: { type: "number" } },
          required: ["score"],
          additionalProperties: false,
        },
      });
      expect(fake.calls[0].responseFormat).toBe("json");
    });

    it("keeps the plain json path when the schema has optional fields — strict would force them nullable", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue(JSON.stringify({ chat: "hi" }));
      const service = makeService(fake);
      await service.processStructuredPrompt({
        service: "example-summary",
        messages,
        schema: z.object({ chat: z.string(), note: z.string().optional() }),
      });
      expect("jsonSchema" in fake.calls[0]).toBe(false);
    });

    it("keeps the strict schema on repair calls", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue("not json");
      fake.enqueue(JSON.stringify({ score: 7 }));
      const service = makeService(fake);
      await service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema });
      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[1].jsonSchema).toEqual(fake.calls[0].jsonSchema);
    });
  });

  describe("streamPrompt", () => {
    it("yields ordered deltas that concatenate to the done chunk's fullText", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue("one two three four five six seven");
      const service = makeService(fake);
      const chunks = await collect(service.streamPrompt({ service: "example-summary", messages }));

      const deltas = chunks.filter((chunk) => chunk.type === "delta").map((chunk) => chunk.text);
      expect(deltas).toEqual(["one two three", " four five six", " seven"]);
      const done = chunks.at(-1);
      if (done?.type !== "done") throw new Error("expected a done chunk");
      expect(done.fullText).toBe("one two three four five six seven");
      expect(done.model).toBe("primary-model");
      expect(done.usage.inputTokens).toBeGreaterThan(0);
      expect(done.usage.outputTokens).toBeGreaterThan(0);
    });

    it("ends quietly on abort: no done chunk, no throw", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue("one two three four five six seven eight nine");
      const service = makeService(fake);
      const abort = new AbortController();
      const received: LlmStreamChunk[] = [];
      for await (const chunk of service.streamPrompt({ service: "example-summary", messages, signal: abort.signal })) {
        received.push(chunk);
        abort.abort();
      }
      expect(received).toEqual([{ type: "delta", text: "one two three" }]);
    });

    it("throws LlmError on a mid-stream provider error, after the earlier deltas", async () => {
      const stub = new StubAdapter();
      stub.scriptStream({ type: "delta", text: "partial " }, new Error("connection reset"));
      const service = makeService(stub);
      const received: LlmStreamChunk[] = [];
      let thrown: unknown;
      try {
        for await (const chunk of service.streamPrompt({ service: "example-summary", messages })) {
          received.push(chunk);
        }
      } catch (error) {
        thrown = error;
      }
      expect(received).toEqual([{ type: "delta", text: "partial " }]);
      expect(thrown).toBeInstanceOf(LlmError);
      expect((thrown as LlmError).code).toBe("provider_error");
      expect((thrown as LlmError).cause).toBeInstanceOf(Error);
    });
  });

  describe("processTurn", () => {
    const itemTool: LlmFunctionTool = {
      type: "function",
      name: "lookup_item",
      description: "Reads one item.",
      parameters: z.object({ id: z.number() }),
    };

    it("returns a final result carrying the text, usage and model", async () => {
      const service = makeService(new FakeLlmProvider());
      const result = await service.processTurn({ service: "example-summary", messages, tools: [itemTool] });
      if (result.type !== "final") throw new Error("expected a final result");
      expect(result.text).toBe("[fake:primary-model] Summarize my open items.");
      expect(result.model).toBe("primary-model");
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
    });

    it("derives function-tool schemas from Zod once and sends the plain derivation to the adapter", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake);
      await service.processTurn({ service: "example-summary", messages, tools: [itemTool] });
      expect(fake.calls[0].responseFormat).toBe("text");
      expect(fake.calls[0].tools).toEqual([
        {
          type: "function",
          name: "lookup_item",
          description: "Reads one item.",
          parametersJsonSchema: {
            type: "object",
            properties: { id: { type: "number" } },
            required: ["id"],
            additionalProperties: false,
          },
          strict: true,
        },
      ]);
    });

    it("marks a tool with optional parameters non-strict but still sends its schema", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake);
      await service.processTurn({
        service: "example-summary",
        messages,
        tools: [{ ...itemTool, parameters: z.object({ id: z.number().optional() }) }],
      });
      const [sent] = fake.calls[0].tools ?? [];
      expect(sent).toMatchObject({ type: "function", name: "lookup_item", strict: false });
    });

    it("returns the scripted tool calls with their accompanying text", async () => {
      const fake = new FakeLlmProvider();
      const toolCalls = [{ id: "call-1", name: "lookup_item", argumentsJson: '{"id":1}' }];
      fake.enqueueToolCalls(toolCalls, "let me look");
      const service = makeService(fake);
      const result = await service.processTurn({ service: "example-summary", messages, tools: [itemTool] });
      if (result.type !== "tool_calls") throw new Error("expected a tool_calls result");
      expect(result.toolCalls).toEqual(toolCalls);
      expect(result.text).toBe("let me look");
      expect(result.usage.outputTokens).toBeGreaterThan(0);
    });

    it("passes hosted tools through untouched on an openai route", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { provider: "openai" } });
      const tools = [
        { type: "file_search" as const, name: "product-docs", vectorStoreIds: ["vs_1"], maxNumResults: 5 },
        { type: "web_search" as const },
      ];
      await service.processTurn({ service: "example-summary", messages, tools });
      expect(fake.calls[0].tools).toEqual(tools);
    });

    it("fails fast, before any adapter call, when hosted tools ride a non-openai chain", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake); // declared provider: anthropic
      const rejection = await service
        .processTurn({ service: "example-summary", messages, tools: [{ type: "web_search" }] })
        .then(
          () => null,
          (error: unknown) => error
        );
      expect(rejection).toBeInstanceOf(LlmError);
      expect((rejection as LlmError).code).toBe("configuration");
      expect((rejection as LlmError).message).toContain('service "example-summary"');
      expect((rejection as LlmError).message).toContain("anthropic/primary-model");
      expect(fake.calls).toHaveLength(0);
    });

    it("fails fast when only a fallback route is non-openai — a failover would drop the retrieval", async () => {
      const primary = new FakeLlmProvider();
      const fallback = new FakeLlmProvider();
      const service = makeService(primary, {
        entry: { provider: "openai" },
        fallback: { adapter: fallback, entry: { provider: "anthropic", model: "fallback-model" } },
      });
      await expect(
        service.processTurn({ service: "example-summary", messages, tools: [{ type: "web_search" }] })
      ).rejects.toMatchObject({ code: "configuration", message: expect.stringContaining("anthropic/fallback-model") });
      expect(primary.calls).toHaveLength(0);
    });

    it("threads the route's toolChoice into a tool-carrying turn and omits it when unset", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { toolChoice: "required" } });
      await service.processTurn({ service: "example-summary", messages, tools: [itemTool] });
      expect(fake.calls[0].toolChoice).toBe("required");

      const bare = new FakeLlmProvider();
      await makeService(bare).processTurn({ service: "example-summary", messages, tools: [itemTool] });
      expect("toolChoice" in bare.calls[0]).toBe(false);
    });

    it("lets the request's toolChoice beat the route's — the runner's downgrade seam", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { toolChoice: "required" } });
      await service.processTurn({ service: "example-summary", messages, tools: [itemTool], toolChoice: "auto" });
      expect(fake.calls[0].toolChoice).toBe("auto");
    });

    it("never sends the route's toolChoice on a tool-less call — the prompt paths ignore the knob", async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { toolChoice: "required" } });
      await service.processPrompt({ service: "example-summary", messages });
      expect("toolChoice" in fake.calls[0]).toBe(false);
    });

    it('fails fast, before any adapter call, when toolChoice "required" rides a turn with no tools', async () => {
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { entry: { toolChoice: "required" } });
      const rejection = await service.processTurn({ service: "example-summary", messages, tools: [] }).then(
        () => null,
        (error: unknown) => error
      );
      expect(rejection).toBeInstanceOf(LlmError);
      expect((rejection as LlmError).code).toBe("configuration");
      expect((rejection as LlmError).message).toContain('toolChoice "required"');
      expect((rejection as LlmError).message).toContain("anthropic/primary-model");
      expect(fake.calls).toHaveLength(0);
      // The request-level "required" hits the same guard.
      await expect(
        makeService(new FakeLlmProvider()).processTurn({
          service: "example-summary",
          messages,
          tools: [],
          toolChoice: "required",
        })
      ).rejects.toMatchObject({ code: "configuration" });
    });

    it("fails fast when only a fallback route requires tools — a failover would hit it", async () => {
      const primary = new FakeLlmProvider();
      const fallback = new FakeLlmProvider();
      const service = makeService(primary, {
        fallback: { adapter: fallback, entry: { toolChoice: "required" } },
      });
      await expect(service.processTurn({ service: "example-summary", messages, tools: [] })).rejects.toMatchObject({
        code: "configuration",
        message: expect.stringContaining("openai/fallback-model"),
      });
      expect(primary.calls).toHaveLength(0);
    });

    it("retries a truncated turn like any other call", async () => {
      const stub = new StubAdapter("anthropic");
      stub.script(truncated("cut off"), ok("full answer"));
      const service = makeService(stub);
      const result = await service.processTurn({ service: "example-summary", messages, tools: [itemTool] });
      expect(result).toMatchObject({ type: "final", text: "full answer" });
      expect(stub.calls).toHaveLength(2);
    });

    it("fails an attempt on a tool_calls finish that carries no calls", async () => {
      const stub = new StubAdapter("anthropic");
      const empty: ProviderResult = { ...ok(""), finishReason: "tool_calls" };
      stub.script(empty, empty, empty);
      const service = makeService(stub);
      await expect(
        service.processTurn({ service: "example-summary", messages, tools: [itemTool] })
      ).rejects.toMatchObject({
        name: "LlmError",
        code: "provider_error",
        message: expect.stringContaining('reason "tool_calls"'),
      });
      expect(stub.calls).toHaveLength(3);
    });

    it("fails over to the fallback like the other non-stream paths", async () => {
      const primary = new StubAdapter("anthropic");
      primary.script(categorized("billing_quota"));
      const fallback = new FakeLlmProvider();
      const service = makeService(primary, { fallback: { adapter: fallback } });
      const result = await service.processTurn({ service: "example-summary", messages, tools: [itemTool] });
      expect(result).toMatchObject({ type: "final", model: "fallback-model" });
      expect(primary.calls).toHaveLength(1);
    });

    it("threads responseFormat and jsonSchema through to the adapter for structured final answers", async () => {
      const fake = new FakeLlmProvider();
      fake.enqueue('{"ok":true}');
      const service = makeService(fake);
      await service.processTurn({
        service: "example-summary",
        messages,
        tools: [itemTool],
        responseFormat: "json",
        jsonSchema: { name: "final_output", schema: { type: "object" } },
      });
      expect(fake.calls[0].responseFormat).toBe("json");
      expect(fake.calls[0].jsonSchema).toEqual({ name: "final_output", schema: { type: "object" } });
    });

    it("emits the existing telemetry pair under mode turn, usage included", async () => {
      const telemetry = new RecordingTelemetry();
      const fake = new FakeLlmProvider();
      fake.enqueueToolCalls([{ id: "call-1", name: "lookup_item", argumentsJson: "{}" }]);
      const service = makeService(fake, { telemetry });
      await service.processTurn({ service: "example-summary", messages, tools: [itemTool], referenceId: "conv-9" });

      expect(telemetry.events.map((event) => event.type)).toEqual(["started", "ended"]);
      const [started, ended] = telemetry.events;
      expect(started.ctx).toMatchObject({ mode: "turn", referenceId: "conv-9", provider: "fake", attempt: 1 });
      if (ended.type !== "ended") throw new Error("expected an ended event");
      expect(ended.outcome).toMatchObject({ status: "success", finishReason: "tool_calls" });
      expect(ended.outcome.usage?.outputTokens).toBeGreaterThan(0);
    });
  });

  describe("abort on non-stream paths", () => {
    const abortNamedError = (): Error => Object.assign(new Error("The operation was aborted"), { name: "AbortError" });

    it("rejects processPrompt with LlmError(aborted) on a mid-flight abort — no retry, no failover", async () => {
      const telemetry = new RecordingTelemetry();
      const primary = new StubAdapter("anthropic");
      primary.script(abortNamedError());
      const fallback = new FakeLlmProvider();
      const service = makeService(primary, { telemetry, fallback: { adapter: fallback } });

      await expect(service.processPrompt({ service: "example-summary", messages })).rejects.toMatchObject({
        name: "LlmError",
        code: "aborted",
      });
      expect(primary.calls).toHaveLength(1);
      expect(fallback.calls).toHaveLength(0);
      // The stream vocabulary holds: callEnded("aborted"), no errorCaptured.
      expect(telemetry.events.map((event) => event.type)).toEqual(["started", "ended"]);
      const ended = telemetry.events[1];
      if (ended.type !== "ended") throw new Error("expected an ended event");
      expect(ended.outcome.status).toBe("aborted");
      expect(ended.outcome.errorMessage).toBeNull();
    });

    it("rejects before any adapter call when the signal is already aborted", async () => {
      const telemetry = new RecordingTelemetry();
      const fake = new FakeLlmProvider();
      const service = makeService(fake, { telemetry });
      const abort = new AbortController();
      abort.abort();

      await expect(
        service.processPrompt({ service: "example-summary", messages, signal: abort.signal })
      ).rejects.toMatchObject({
        code: "aborted",
      });
      await expect(
        service.processStructuredPrompt({
          service: "example-summary",
          messages,
          schema: scoreSchema,
          signal: abort.signal,
        })
      ).rejects.toMatchObject({ code: "aborted" });
      await expect(
        service.processTurn({ service: "example-summary", messages, tools: [], signal: abort.signal })
      ).rejects.toMatchObject({ code: "aborted" });
      expect(fake.calls).toHaveLength(0);
      expect(telemetry.events).toHaveLength(0);
    });

    it("rejects processTurn with LlmError(aborted) on a mid-flight abort", async () => {
      const stub = new StubAdapter("anthropic");
      stub.script(abortNamedError());
      const service = makeService(stub);
      await expect(service.processTurn({ service: "example-summary", messages, tools: [] })).rejects.toMatchObject({
        code: "aborted",
      });
      expect(stub.calls).toHaveLength(1);
    });
  });

  describe("failover", () => {
    it("fails over to the fallback when the primary dies on a billing error, without burning retries", async () => {
      const primary = new StubAdapter("anthropic");
      primary.script(categorized("billing_quota"));
      const fallback = new FakeLlmProvider();
      const service = makeService(primary, { fallback: { adapter: fallback } });

      await expect(service.processPrompt({ service: "example-summary", messages })).resolves.toBe(
        "[fake:fallback-model] Summarize my open items."
      );
      // Immediate switch: one call on the dead primary, not three.
      expect(primary.calls).toHaveLength(1);
      expect(fallback.calls).toHaveLength(1);
      expect(fallback.calls[0]).toMatchObject({ model: "fallback-model", maxOutputTokens: 256 });
    });

    it.each(["rate_limited", "unavailable", "auth"] as const)(
      "switches immediately on a %s failure",
      async (category) => {
        const primary = new StubAdapter("anthropic");
        primary.script(categorized(category));
        const fallback = new FakeLlmProvider();
        const service = makeService(primary, { fallback: { adapter: fallback } });
        await service.processPrompt({ service: "example-summary", messages });
        expect(primary.calls).toHaveLength(1);
      }
    );

    it("retries the primary to exhaustion on other errors before moving down the chain", async () => {
      const primary = new StubAdapter("anthropic");
      primary.script(new Error("boom"), new Error("boom"), new Error("boom"));
      const fallback = new FakeLlmProvider();
      const service = makeService(primary, { fallback: { adapter: fallback } });

      await expect(service.processPrompt({ service: "example-summary", messages })).resolves.toContain(
        "[fake:fallback-model]"
      );
      expect(primary.calls).toHaveLength(3);
      expect(fallback.calls).toHaveLength(1);
    });

    it("keeps the pre-failover retry loop when no fallback exists, even on a fallback-worthy error", async () => {
      const primary = new StubAdapter("anthropic");
      primary.script(categorized("unavailable"), categorized("unavailable"), ok("recovered"));
      const service = makeService(primary);
      // Zero fallbacks = today's behavior: a 5xx retries on the same provider.
      await expect(service.processPrompt({ service: "example-summary", messages })).resolves.toBe("recovered");
      expect(primary.calls).toHaveLength(3);
    });

    it("throws an LlmError listing every route tried when the chain is exhausted", async () => {
      const primary = new StubAdapter("anthropic");
      primary.script(categorized("billing_quota"));
      const fallback = new StubAdapter("openai");
      fallback.script(new Error("boom"), new Error("boom"), new Error("boom"));
      const service = makeService(primary, { fallback: { adapter: fallback } });

      const rejection = await service.processPrompt({ service: "example-summary", messages }).then(
        () => null,
        (error: unknown) => error
      );
      expect(rejection).toBeInstanceOf(LlmError);
      expect((rejection as LlmError).code).toBe("provider_error");
      expect((rejection as LlmError).context.attemptedRoutes).toEqual([
        { provider: "anthropic", model: "primary-model" },
        { provider: "openai", model: "fallback-model" },
      ]);
      expect(primary.calls).toHaveLength(1);
      expect(fallback.calls).toHaveLength(3);
    });

    it("fails a structured call over and validates the fallback's output", async () => {
      const primary = new StubAdapter("anthropic");
      primary.script(categorized("rate_limited"));
      const fallback = new FakeLlmProvider();
      fallback.enqueue(JSON.stringify({ score: 9 }));
      const service = makeService(primary, { fallback: { adapter: fallback } });

      await expect(
        service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema })
      ).resolves.toEqual({ score: 9 });
      expect(primary.calls).toHaveLength(1);
      expect(fallback.calls[0].responseFormat).toBe("json");
    });

    it("fails a stream over before the first delta — the consumer sees only the fallback's chunks", async () => {
      const primary = new StubAdapter("anthropic");
      primary.scriptStream(new Error("connection refused"));
      const fallback = new FakeLlmProvider();
      fallback.enqueue("steady progress wins");
      const service = makeService(primary, { fallback: { adapter: fallback } });

      const chunks = await collect(service.streamPrompt({ service: "example-summary", messages }));
      expect(chunks.filter((chunk) => chunk.type === "delta").map((chunk) => chunk.text)).toEqual([
        "steady progress wins",
      ]);
      expect(chunks.at(-1)).toMatchObject({ type: "done", model: "fallback-model" });
      expect(primary.calls).toHaveLength(1);
    });

    it("never fails a stream over after the first delta — a switch would replay text", async () => {
      const primary = new StubAdapter("anthropic");
      primary.scriptStream({ type: "delta", text: "partial " }, categorized("unavailable"));
      const fallback = new FakeLlmProvider();
      const service = makeService(primary, { fallback: { adapter: fallback } });

      const received: LlmStreamChunk[] = [];
      let thrown: unknown;
      try {
        for await (const chunk of service.streamPrompt({ service: "example-summary", messages })) {
          received.push(chunk);
        }
      } catch (error) {
        thrown = error;
      }
      expect(received).toEqual([{ type: "delta", text: "partial " }]);
      expect(thrown).toBeInstanceOf(LlmError);
      expect((thrown as LlmError).context.attemptedRoutes).toEqual([{ provider: "anthropic", model: "primary-model" }]);
      expect(fallback.calls).toHaveLength(0);
    });

    it("throws with every route tried when all streams fail before their first delta", async () => {
      const primary = new StubAdapter("anthropic");
      primary.scriptStream(new Error("refused"));
      const fallback = new StubAdapter("openai");
      fallback.scriptStream(new Error("refused too"));
      const service = makeService(primary, { fallback: { adapter: fallback } });

      const rejection = await collect(service.streamPrompt({ service: "example-summary", messages })).then(
        () => null,
        (error: unknown) => error
      );
      expect(rejection).toBeInstanceOf(LlmError);
      expect((rejection as LlmError).code).toBe("provider_error");
      expect((rejection as LlmError).context.attemptedRoutes).toEqual([
        { provider: "anthropic", model: "primary-model" },
        { provider: "openai", model: "fallback-model" },
      ]);
    });
  });

  describe("telemetry", () => {
    it("emits callStarted then callEnded(success) around a successful call", async () => {
      const telemetry = new RecordingTelemetry();
      const service = makeService(new FakeLlmProvider(), { telemetry });
      await service.processPrompt({ service: "example-summary", messages, referenceId: "conv-1" });

      expect(telemetry.events.map((event) => event.type)).toEqual(["started", "ended"]);
      const [started, ended] = telemetry.events;
      expect(started.ctx).toMatchObject({
        referenceId: "conv-1",
        service: "example-summary",
        provider: "fake",
        model: "primary-model",
        mode: "prompt",
        attempt: 1,
      });
      if (ended.type !== "ended") throw new Error("expected an ended event");
      expect(ended.outcome).toMatchObject({ status: "success", finishReason: "stop", errorMessage: null });
      expect(ended.outcome.usage?.inputTokens).toBeGreaterThan(0);
    });

    it("records a failure per attempt and captures the error only at terminal failure", async () => {
      const telemetry = new RecordingTelemetry();
      const stub = new StubAdapter();
      stub.script(new Error("boom"), new Error("boom"), new Error("boom"));
      const service = makeService(stub, { telemetry });
      await expect(service.processPrompt({ service: "example-summary", messages })).rejects.toBeInstanceOf(LlmError);

      expect(telemetry.events.map((event) => event.type)).toEqual([
        "started",
        "ended",
        "started",
        "ended",
        "started",
        "ended",
        "error",
      ]);
      const attempts = telemetry.events.filter((event) => event.type === "started").map((event) => event.ctx.attempt);
      expect(attempts).toEqual([1, 2, 3]);
      const failures = telemetry.events.filter((event) => event.type === "ended");
      for (const failure of failures) {
        if (failure.type === "ended") expect(failure.outcome.status).toBe("failure");
      }
    });

    it("keeps the attempt counter incrementing across a failover, each event under its own provider", async () => {
      const telemetry = new RecordingTelemetry();
      const primary = new StubAdapter("anthropic");
      primary.script(categorized("billing_quota"));
      const fallback = new StubAdapter("openai");
      fallback.script(ok("served by the fallback"));
      const service = makeService(primary, { telemetry, fallback: { adapter: fallback } });

      await expect(service.processPrompt({ service: "example-summary", messages })).resolves.toBe(
        "served by the fallback"
      );

      // One started/ended pair per attempt, in sequence — a sink that stores
      // rows correlates them by (requestId, attempt), so the counter must not reset.
      expect(telemetry.events.map((event) => event.type)).toEqual(["started", "ended", "started", "ended"]);
      const [primaryStarted, primaryEnded, fallbackStarted, fallbackEnded] = telemetry.events;
      expect(primaryStarted.ctx).toMatchObject({ provider: "anthropic", model: "primary-model", attempt: 1 });
      expect(fallbackStarted.ctx).toMatchObject({ provider: "openai", model: "fallback-model", attempt: 2 });
      expect(primaryStarted.ctx.requestId).toBe(fallbackStarted.ctx.requestId);
      if (primaryEnded.type !== "ended" || fallbackEnded.type !== "ended") throw new Error("expected ended events");
      expect(primaryEnded.outcome.status).toBe("failure");
      expect(fallbackEnded.outcome.status).toBe("success");
      // The failover succeeded — nothing terminal to capture.
      expect(telemetry.events.filter((event) => event.type === "error")).toHaveLength(0);
    });

    it("fires structuredOutputFailed with a content preview, numbering the repair attempt after the main one", async () => {
      const telemetry = new RecordingTelemetry();
      const fake = new FakeLlmProvider();
      fake.enqueue("not json");
      fake.enqueue(JSON.stringify({ score: 1 }));
      const service = makeService(fake, { telemetry });
      await service.processStructuredPrompt({ service: "example-summary", messages, schema: scoreSchema });

      const failed = telemetry.events.find((event) => event.type === "structured-failed");
      if (failed?.type !== "structured-failed") throw new Error("expected a structured-failed event");
      expect(failed.failure.kind).toBe("invalid-json");
      expect(failed.failure.contentPreview).toBe("not json");
      const attempts = telemetry.events.filter((event) => event.type === "started").map((event) => event.ctx.attempt);
      expect(attempts).toEqual([1, 2]); // the repair call keeps counting up
      expect(telemetry.events.filter((event) => event.type === "error")).toHaveLength(0);
    });

    it("records an aborted stream as aborted, not as an error", async () => {
      const telemetry = new RecordingTelemetry();
      const fake = new FakeLlmProvider();
      fake.enqueue("one two three four five six");
      const service = makeService(fake, { telemetry });
      const abort = new AbortController();
      const received: LlmStreamChunk[] = [];
      for await (const chunk of service.streamPrompt({ service: "example-summary", messages, signal: abort.signal })) {
        received.push(chunk);
        abort.abort();
      }
      expect(received).toHaveLength(1);

      expect(telemetry.events.map((event) => event.type)).toEqual(["started", "ended"]);
      const ended = telemetry.events[1];
      if (ended.type !== "ended") throw new Error("expected an ended event");
      expect(ended.outcome.status).toBe("aborted");
      expect(ended.outcome.errorMessage).toBeNull();
    });
  });
});
