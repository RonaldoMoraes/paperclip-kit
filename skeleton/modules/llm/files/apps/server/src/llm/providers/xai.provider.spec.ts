import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { HostedToolsUnsupportedError, JSON_STEERING_SENTENCE, type ProviderCallSettings } from "./provider.types";
import {
  buildXaiCallSettings,
  buildXaiTools,
  classifyXaiError,
  convertMessagesForXai,
  normalizeXaiFinishReason,
} from "./xai.provider";

const settings = (overrides: Partial<ProviderCallSettings> = {}): ProviderCallSettings => ({
  model: "grok-4",
  messages: [
    { role: "system", content: "Be brief." },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi there" },
  ],
  maxOutputTokens: 512,
  responseFormat: "text",
  ...overrides,
});

describe("convertMessagesForXai", () => {
  it("extracts system messages and keeps the rest as model messages", () => {
    const converted = convertMessagesForXai(settings().messages);
    expect(converted.system).toBe("Be brief.");
    expect(converted.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
  });

  it("omits system when there is no system message", () => {
    expect("system" in convertMessagesForXai([{ role: "user", content: "hello" }])).toBe(false);
  });

  it("replays an assistant tool-call turn as text plus tool-call parts with parsed input", () => {
    const converted = convertMessagesForXai([
      {
        role: "assistant",
        content: "checking",
        toolCalls: [{ id: "call-1", name: "lookup_item", argumentsJson: '{"id":1}' }],
      },
    ]);
    expect(converted.messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          { type: "tool-call", toolCallId: "call-1", toolName: "lookup_item", input: { id: 1 } },
        ],
      },
    ]);
  });

  it("replays tool results as tool messages, errors as error-text output", () => {
    const converted = convertMessagesForXai([
      { role: "tool", toolCallId: "call-1", toolName: "lookup_item", content: "item one" },
      { role: "tool", toolCallId: "call-2", toolName: "count_items", content: "broken", isError: true },
    ]);
    expect(converted.messages).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "lookup_item",
            output: { type: "text", value: "item one" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-2",
            toolName: "count_items",
            output: { type: "error-text", value: "broken" },
          },
        ],
      },
    ]);
  });
});

describe("buildXaiTools", () => {
  it("maps function tools onto an execute-less tool set keyed by name", () => {
    const parametersJsonSchema = { type: "object", properties: {}, additionalProperties: false };
    const tools = buildXaiTools([
      { type: "function", name: "lookup_item", description: "Reads one item.", parametersJsonSchema, strict: false },
    ]);
    expect(Object.keys(tools)).toEqual(["lookup_item"]);
    expect(tools.lookup_item.description).toBe("Reads one item.");
    // No execute: the AI SDK must return the calls instead of looping itself.
    expect("execute" in tools.lookup_item).toBe(false);
  });

  it("rejects hosted tools with the typed error — they are OpenAI-only", () => {
    expect(() => buildXaiTools([{ type: "web_search" }])).toThrowError(HostedToolsUnsupportedError);
    expect(() => buildXaiTools([{ type: "file_search", name: "product-docs", vectorStoreIds: ["vs_1"] }])).toThrowError(
      /OpenAI-only/
    );
  });
});

describe("buildXaiCallSettings", () => {
  it("always disables the AI SDK's own retries", () => {
    // LlmService owns retries; the SDK retrying on top would multiply attempts.
    expect(buildXaiCallSettings(settings()).maxRetries).toBe(0);
  });

  it("passes maxOutputTokens and temperature only when set", () => {
    const bare = buildXaiCallSettings(settings());
    expect(bare.maxOutputTokens).toBe(512);
    expect("temperature" in bare).toBe(false);
    expect(buildXaiCallSettings(settings({ temperature: 0.2 })).temperature).toBe(0.2);
  });

  it("appends the JSON steering sentence for json calls", () => {
    const params = buildXaiCallSettings(settings({ responseFormat: "json" }));
    expect(params.system).toBe(`Be brief.\n\n${JSON_STEERING_SENTENCE}`);
    expect(buildXaiCallSettings(settings()).system).toBe("Be brief.");
  });

  it("includes tools only when the settings carry some", () => {
    const tools = [
      {
        type: "function" as const,
        name: "lookup_item",
        description: "d",
        parametersJsonSchema: { type: "object" },
        strict: false,
      },
    ];
    expect(Object.keys(buildXaiCallSettings(settings({ tools })).tools ?? {})).toEqual(["lookup_item"]);
    expect("tools" in buildXaiCallSettings(settings())).toBe(false);
    expect("tools" in buildXaiCallSettings(settings({ tools: [] }))).toBe(false);
  });

  it("passes toolChoice through unchanged — the AI SDK speaks the same vocabulary", () => {
    const tools = [
      {
        type: "function" as const,
        name: "lookup_item",
        description: "d",
        parametersJsonSchema: { type: "object" },
        strict: false,
      },
    ];
    expect(buildXaiCallSettings(settings({ tools, toolChoice: "required" })).toolChoice).toBe("required");
    expect(buildXaiCallSettings(settings({ tools, toolChoice: "none" })).toolChoice).toBe("none");
    expect("toolChoice" in buildXaiCallSettings(settings({ tools }))).toBe(false);
  });
});

describe("normalizeXaiFinishReason", () => {
  it.each([
    ["stop", "stop"],
    ["length", "length"],
    ["tool-calls", "tool_calls"],
    ["content-filter", "content-filter"],
    [undefined, null],
  ] as const)("maps %s to %s", (finishReason, expected) => {
    expect(normalizeXaiFinishReason(finishReason)).toBe(expected);
  });
});

describe("classifyXaiError", () => {
  const apiCallError = (statusCode?: number): APICallError =>
    new APICallError({
      message: statusCode === undefined ? "Failed to connect" : `HTTP ${statusCode}`,
      url: "https://api.x.ai/v1/responses",
      requestBodyValues: {},
      ...(statusCode !== undefined && { statusCode }),
      isRetryable: false,
    });

  it.each([
    [apiCallError(402), "billing_quota"],
    [apiCallError(429), "rate_limited"],
    [apiCallError(401), "auth"],
    [apiCallError(403), "auth"],
    [apiCallError(500), "unavailable"],
    [apiCallError(503), "unavailable"],
    // No statusCode = the call never got a response: connection or timeout.
    [apiCallError(undefined), "unavailable"],
    [apiCallError(404), "other"],
    [apiCallError(400), "other"],
    [new Error("something else"), "other"],
  ] as const)("classifies %s as %s", (error, expected) => {
    expect(classifyXaiError(error)).toBe(expected);
  });

  it("unwraps a RetryError to its last underlying error", () => {
    const wrapped = new RetryError({
      message: "Failed after 1 attempt",
      reason: "maxRetriesExceeded",
      errors: [apiCallError(429)],
    });
    expect(classifyXaiError(wrapped)).toBe("rate_limited");
  });
});
