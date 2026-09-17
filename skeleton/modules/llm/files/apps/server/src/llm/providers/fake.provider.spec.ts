import { describe, expect, it } from "vitest";
import { FakeLlmProvider, FakeProviderError } from "./fake.provider";
import type { ProviderCallSettings, ProviderStreamEvent } from "./provider.types";

const settings = (overrides: Partial<ProviderCallSettings> = {}): ProviderCallSettings => ({
  model: "fake-model",
  messages: [
    { role: "system", content: "You are the assistant." },
    { role: "user", content: "How do I sleep better at night without screens?" },
  ],
  maxOutputTokens: 256,
  responseFormat: "text",
  ...overrides,
});

async function collect(stream: AsyncIterable<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
  const events: ProviderStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("FakeLlmProvider", () => {
  it("is deterministic: same input twice gives the same output", async () => {
    const fake = new FakeLlmProvider();
    const first = await fake.complete(settings());
    const second = await fake.complete(settings());
    expect(second).toEqual(first);
    expect(first.text).toBe("[fake:fake-model] How do I sleep better at night without screens?");
    expect(first.finishReason).toBe("stop");
  });

  it("truncates the default echo to the first 80 chars of the last user message", async () => {
    const fake = new FakeLlmProvider();
    const long = "x".repeat(200);
    const result = await fake.complete(settings({ messages: [{ role: "user", content: long }] }));
    expect(result.text).toBe(`[fake:fake-model] ${"x".repeat(80)}`);
  });

  it("returns {} for unscripted json calls", async () => {
    const fake = new FakeLlmProvider();
    const result = await fake.complete(settings({ responseFormat: "json" }));
    expect(result.text).toBe("{}");
  });

  it("consumes scripted responses FIFO, then falls back to the default", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueue("first");
    fake.enqueue((s) => `scripted for ${s.model}`);
    expect((await fake.complete(settings())).text).toBe("first");
    expect((await fake.complete(settings())).text).toBe("scripted for fake-model");
    expect((await fake.complete(settings())).text).toContain("[fake:fake-model]");
  });

  it("records every invocation on calls", async () => {
    const fake = new FakeLlmProvider();
    const first = settings();
    const second = settings({ responseFormat: "json", temperature: 0.2 });
    await fake.complete(first);
    await collect(fake.stream(second));
    expect(fake.calls).toEqual([first, second]);
  });

  it("streams stable ~3-word chunks that concatenate to the full text", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueue("one two three four five six seven");
    const events = await collect(fake.stream(settings()));
    const deltas = events.filter((event) => event.type === "delta").map((event) => event.text);
    expect(deltas).toEqual(["one two three", " four five six", " seven"]);
    expect(deltas.join("")).toBe("one two three four five six seven");
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("stops yielding on abort, with no done event", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueue("one two three four five six seven eight nine");
    const abort = new AbortController();
    const events: ProviderStreamEvent[] = [];
    for await (const event of fake.stream(settings(), abort.signal)) {
      events.push(event);
      abort.abort();
    }
    expect(events).toEqual([{ type: "delta", text: "one two three" }]);
  });

  it("rejects a complete call with a scripted classified error", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueueError("billing_quota");
    const rejection = await fake.complete(settings()).then(
      () => null,
      (error: unknown) => error
    );
    expect(rejection).toBeInstanceOf(FakeProviderError);
    expect(fake.classifyError(rejection)).toBe("billing_quota");
    expect(fake.calls).toHaveLength(1); // the failed call is still recorded
  });

  it("throws a scripted error on stream before yielding any delta", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueueError("unavailable", "scripted outage");
    const events: ProviderStreamEvent[] = [];
    let thrown: unknown;
    try {
      for await (const event of fake.stream(settings())) events.push(event);
    } catch (error) {
      thrown = error;
    }
    expect(events).toEqual([]);
    expect(thrown).toBeInstanceOf(FakeProviderError);
    expect((thrown as Error).message).toBe("scripted outage");
    expect(fake.classifyError(thrown)).toBe("unavailable");
  });

  it("shares one FIFO between scripted errors and responses", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueueError("rate_limited");
    fake.enqueue("after the failure");
    await expect(fake.complete(settings())).rejects.toBeInstanceOf(FakeProviderError);
    expect((await fake.complete(settings())).text).toBe("after the failure");
  });

  it("classifies anything that is not a scripted failure as other", () => {
    const fake = new FakeLlmProvider();
    expect(fake.classifyError(new Error("plain"))).toBe("other");
    expect(fake.classifyError("string")).toBe("other");
  });

  it("returns a scripted tool-call turn with finishReason tool_calls and the accompanying text", async () => {
    const fake = new FakeLlmProvider();
    const toolCalls = [{ id: "call-1", name: "lookup_item", argumentsJson: '{"id":1}' }];
    fake.enqueueToolCalls(toolCalls, "let me check");
    const result = await fake.complete(settings());
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual(toolCalls);
    expect(result.text).toBe("let me check");
  });

  it("scripts an agent conversation: a tool-call turn, then a final response, on the one FIFO", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueueToolCalls([{ id: "call-1", name: "lookup_item", argumentsJson: "{}" }]);
    fake.enqueue("here is your summary");
    const first = await fake.complete(settings());
    expect(first.toolCalls).toHaveLength(1);
    const second = await fake.complete(settings());
    expect(second.text).toBe("here is your summary");
    expect(second.finishReason).toBe("stop");
    expect("toolCalls" in second).toBe(false);
  });

  it("computes tool-call usage from the text plus the argument JSON, deterministically", async () => {
    const fake = new FakeLlmProvider();
    // text "ab" (2) + arguments '{"a":1}' (7) = 9 chars → 3 output tokens.
    fake.enqueueToolCalls([{ id: "call-1", name: "t", argumentsJson: '{"a":1}' }], "ab");
    const call = settings({ messages: [{ role: "user", content: "0123456789" }] }); // 10 chars → 3 input tokens
    const result = await fake.complete(call);
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 3 });
  });

  it("records hosted and function tools on calls without acting on them", async () => {
    const fake = new FakeLlmProvider();
    const call = settings({
      tools: [
        { type: "file_search", name: "product-docs", vectorStoreIds: ["vs_1"], maxNumResults: 5 },
        { type: "web_search" },
        {
          type: "function",
          name: "lookup_item",
          description: "d",
          parametersJsonSchema: { type: "object" },
          strict: true,
        },
      ],
    });
    const result = await fake.complete(call);
    // Inert: the default deterministic answer, with the tools on the record.
    expect(result.text).toContain("[fake:fake-model]");
    expect(fake.calls[0].tools).toEqual(call.tools);
  });

  it("ends a stream that consumes a scripted tool-call turn with a non-stop done — streams carry no tool events", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueueToolCalls([{ id: "call-1", name: "t", argumentsJson: "{}" }]);
    const events = await collect(fake.stream(settings()));
    expect(events).toEqual([{ type: "done", usage: expect.anything(), finishReason: "tool_calls" }]);
  });

  it("computes deterministic usage from prompt and response chars", async () => {
    const fake = new FakeLlmProvider();
    fake.enqueue("abcdefgh"); // 8 chars → 2 output tokens
    const call = settings({ messages: [{ role: "user", content: "0123456789" }] }); // 10 chars → 3 input tokens
    const result = await fake.complete(call);
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 2 });

    fake.enqueue("abcdefgh");
    const events = await collect(fake.stream(call));
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("expected a done event");
    expect(done.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
  });
});
