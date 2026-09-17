import { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages/messages";
import { describe, expect, it } from "vitest";
import {
  buildAnthropicRequestParams,
  buildAnthropicTools,
  classifyAnthropicError,
  convertMessagesForAnthropic,
  extractAnthropicToolCalls,
  normalizeAnthropicStopReason,
} from "./anthropic.provider";
import { HostedToolsUnsupportedError, JSON_STEERING_SENTENCE, type ProviderCallSettings } from "./provider.types";

const settings = (overrides: Partial<ProviderCallSettings> = {}): ProviderCallSettings => ({
  model: "claude-sonnet-4-6",
  messages: [
    { role: "system", content: "Be brief." },
    { role: "system", content: "Be kind." },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi there" },
  ],
  maxOutputTokens: 512,
  responseFormat: "text",
  ...overrides,
});

describe("convertMessagesForAnthropic", () => {
  it("extracts system messages into one joined system prompt", () => {
    const converted = convertMessagesForAnthropic(settings().messages);
    expect(converted.system).toBe("Be brief.\n\nBe kind.");
    expect(converted.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
  });

  it("omits the system prompt when there is none", () => {
    const converted = convertMessagesForAnthropic([{ role: "user", content: "hello" }]);
    expect("system" in converted).toBe(false);
  });

  it("replays an assistant tool-call turn as text plus tool_use blocks with parsed input", () => {
    const converted = convertMessagesForAnthropic([
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
          { type: "tool_use", id: "call-1", name: "lookup_item", input: { id: 1 } },
        ],
      },
    ]);
  });

  it("coalesces consecutive tool results into the one user message that must follow the tool_use turn", () => {
    const converted = convertMessagesForAnthropic([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call-1", name: "lookup_item", argumentsJson: "{}" },
          { id: "call-2", name: "count_items", argumentsJson: "{}" },
        ],
      },
      { role: "tool", toolCallId: "call-1", toolName: "lookup_item", content: "item one" },
      { role: "tool", toolCallId: "call-2", toolName: "count_items", content: "broken", isError: true },
    ]);
    expect(converted.messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call-1", name: "lookup_item", input: {} },
          { type: "tool_use", id: "call-2", name: "count_items", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call-1", content: "item one" },
          { type: "tool_result", tool_use_id: "call-2", content: "broken", is_error: true },
        ],
      },
    ]);
  });
});

describe("buildAnthropicTools", () => {
  it("maps function tools onto the Messages tools shape", () => {
    const parametersJsonSchema = { type: "object", properties: {}, additionalProperties: false };
    expect(
      buildAnthropicTools([
        { type: "function", name: "lookup_item", description: "Reads one item.", parametersJsonSchema, strict: true },
      ])
    ).toEqual([{ name: "lookup_item", description: "Reads one item.", input_schema: parametersJsonSchema }]);
  });

  it("rejects hosted tools with the typed error — they are OpenAI-only", () => {
    expect(() => buildAnthropicTools([{ type: "web_search" }])).toThrowError(HostedToolsUnsupportedError);
    expect(() =>
      buildAnthropicTools([{ type: "file_search", name: "product-docs", vectorStoreIds: ["vs_1"] }])
    ).toThrowError(/OpenAI-only/);
  });
});

describe("extractAnthropicToolCalls", () => {
  it("surfaces tool_use blocks with their input re-serialized to JSON", () => {
    const content = [
      { type: "text", text: "checking", citations: null },
      { type: "tool_use", id: "call-1", name: "lookup_item", input: { id: 1 } },
    ] as ContentBlock[];
    expect(extractAnthropicToolCalls(content)).toEqual([
      { id: "call-1", name: "lookup_item", argumentsJson: '{"id":1}' },
    ]);
  });
});

describe("buildAnthropicRequestParams", () => {
  it("always passes max_tokens and passes temperature only when set", () => {
    const bare = buildAnthropicRequestParams(settings());
    expect(bare.max_tokens).toBe(512);
    expect("temperature" in bare).toBe(false);
    expect(buildAnthropicRequestParams(settings({ temperature: 0.2 })).temperature).toBe(0.2);
  });

  it("appends the JSON steering sentence to the system prompt for json calls", () => {
    const params = buildAnthropicRequestParams(settings({ responseFormat: "json" }));
    expect(params.system).toBe(`Be brief.\n\nBe kind.\n\n${JSON_STEERING_SENTENCE}`);
  });

  it("steers with the sentence alone when there is no system message", () => {
    const params = buildAnthropicRequestParams(
      settings({ responseFormat: "json", messages: [{ role: "user", content: "hello" }] })
    );
    expect(params.system).toBe(JSON_STEERING_SENTENCE);
  });

  it("leaves the system prompt alone for text calls", () => {
    expect(buildAnthropicRequestParams(settings()).system).toBe("Be brief.\n\nBe kind.");
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
    expect(buildAnthropicRequestParams(settings({ tools })).tools).toHaveLength(1);
    expect("tools" in buildAnthropicRequestParams(settings())).toBe(false);
    expect("tools" in buildAnthropicRequestParams(settings({ tools: [] }))).toBe(false);
  });

  it('maps toolChoice onto the tool_choice object — the layer\'s "required" is the API\'s "any"', () => {
    const tools = [
      {
        type: "function" as const,
        name: "lookup_item",
        description: "d",
        parametersJsonSchema: { type: "object" },
        strict: false,
      },
    ];
    expect(buildAnthropicRequestParams(settings({ tools, toolChoice: "required" })).tool_choice).toEqual({
      type: "any",
    });
    expect(buildAnthropicRequestParams(settings({ tools, toolChoice: "auto" })).tool_choice).toEqual({ type: "auto" });
    expect(buildAnthropicRequestParams(settings({ tools, toolChoice: "none" })).tool_choice).toEqual({ type: "none" });
    expect("tool_choice" in buildAnthropicRequestParams(settings({ tools }))).toBe(false);
  });
});

describe("normalizeAnthropicStopReason", () => {
  it.each([
    ["end_turn", "stop"],
    ["max_tokens", "length"],
    ["tool_use", "tool_calls"],
    ["refusal", "refusal"],
    [null, null],
  ] as const)("maps %s to %s", (stopReason, expected) => {
    expect(normalizeAnthropicStopReason(stopReason)).toBe(expected);
  });
});

describe("classifyAnthropicError", () => {
  const apiError = (status: number, type: string, message: string): APIError =>
    APIError.generate(status, { error: { type, message } }, undefined, new Headers());

  it.each([
    // Anthropic has no 402: exhausted credit is a 400 invalid_request_error
    // naming the credit balance in its message.
    [
      apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."),
      "billing_quota",
    ],
    [apiError(429, "rate_limit_error", "Number of requests has exceeded your rate limit"), "rate_limited"],
    [apiError(401, "authentication_error", "invalid x-api-key"), "auth"],
    [apiError(403, "permission_error", "not permitted"), "auth"],
    [apiError(500, "api_error", "internal server error"), "unavailable"],
    [apiError(529, "overloaded_error", "Overloaded"), "unavailable"],
    [new APIConnectionError({ message: "Connection error." }), "unavailable"],
    [apiError(400, "invalid_request_error", "max_tokens is required"), "other"],
    [apiError(404, "not_found_error", "model not found"), "other"],
    [new Error("something else"), "other"],
  ] as const)("classifies %s as %s", (error, expected) => {
    expect(classifyAnthropicError(error)).toBe(expected);
  });
});
