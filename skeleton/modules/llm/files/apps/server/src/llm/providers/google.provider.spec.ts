import { ApiError, FunctionCallingConfigMode } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
  buildGoogleRequestParams,
  buildGoogleTools,
  classifyGoogleError,
  convertMessagesForGoogle,
  extractGoogleToolCalls,
  normalizeGoogleFinishReason,
} from "./google.provider";
import { HostedToolsUnsupportedError, type ProviderCallSettings } from "./provider.types";

const settings = (overrides: Partial<ProviderCallSettings> = {}): ProviderCallSettings => ({
  model: "gemini-2.5-flash",
  messages: [
    { role: "system", content: "Be brief." },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi there" },
  ],
  maxOutputTokens: 512,
  responseFormat: "text",
  ...overrides,
});

describe("convertMessagesForGoogle", () => {
  it("joins system messages into systemInstruction and maps roles", () => {
    const converted = convertMessagesForGoogle(settings().messages);
    expect(converted.systemInstruction).toBe("Be brief.");
    expect(converted.contents).toEqual([
      { role: "user", parts: [{ text: "hello" }] },
      { role: "model", parts: [{ text: "hi there" }] },
    ]);
  });

  it("omits systemInstruction when there is no system message", () => {
    const converted = convertMessagesForGoogle([{ role: "user", content: "hello" }]);
    expect("systemInstruction" in converted).toBe(false);
  });

  it("replays an assistant tool-call turn as model parts with parsed functionCall args", () => {
    const converted = convertMessagesForGoogle([
      {
        role: "assistant",
        content: "checking",
        toolCalls: [{ id: "vendor-id-1", name: "lookup_item", argumentsJson: '{"id":1}' }],
      },
    ]);
    expect(converted.contents).toEqual([
      {
        role: "model",
        parts: [{ text: "checking" }, { functionCall: { name: "lookup_item", args: { id: 1 }, id: "vendor-id-1" } }],
      },
    ]);
  });

  it("replays a tool result as a functionResponse part keyed by output or error", () => {
    const converted = convertMessagesForGoogle([
      { role: "tool", toolCallId: "vendor-id-1", toolName: "lookup_item", content: "item one" },
      { role: "tool", toolCallId: "vendor-id-2", toolName: "count_items", content: "broken", isError: true },
    ]);
    expect(converted.contents).toEqual([
      {
        role: "user",
        parts: [{ functionResponse: { name: "lookup_item", response: { output: "item one" }, id: "vendor-id-1" } }],
      },
      {
        role: "user",
        parts: [{ functionResponse: { name: "count_items", response: { error: "broken" }, id: "vendor-id-2" } }],
      },
    ]);
  });

  it("strips synthesized call ids on replay — the vendor never issued them", () => {
    const converted = convertMessagesForGoogle([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "google-call-0", name: "lookup_item", argumentsJson: "{}" }],
      },
      { role: "tool", toolCallId: "google-call-0", toolName: "lookup_item", content: "item one" },
    ]);
    expect(converted.contents).toEqual([
      { role: "model", parts: [{ functionCall: { name: "lookup_item", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { name: "lookup_item", response: { output: "item one" } } }] },
    ]);
  });
});

describe("buildGoogleTools", () => {
  it("maps function tools as one functionDeclarations group carrying the plain JSON Schema", () => {
    const parametersJsonSchema = { type: "object", properties: {}, additionalProperties: false };
    expect(
      buildGoogleTools([
        { type: "function", name: "lookup_item", description: "Reads one item.", parametersJsonSchema, strict: true },
      ])
    ).toEqual([
      { functionDeclarations: [{ name: "lookup_item", description: "Reads one item.", parametersJsonSchema }] },
    ]);
  });

  it("rejects hosted tools with the typed error — they are OpenAI-only", () => {
    expect(() => buildGoogleTools([{ type: "web_search" }])).toThrowError(HostedToolsUnsupportedError);
    expect(() =>
      buildGoogleTools([{ type: "file_search", name: "product-docs", vectorStoreIds: ["vs_1"] }])
    ).toThrowError(/OpenAI-only/);
  });
});

describe("extractGoogleToolCalls", () => {
  it("surfaces functionCall parts, keeping vendor ids and synthesizing missing ones", () => {
    expect(
      extractGoogleToolCalls([
        { text: "checking" },
        { functionCall: { id: "vendor-id-1", name: "lookup_item", args: { id: 1 } } },
        { functionCall: { name: "count_items" } },
      ])
    ).toEqual([
      { id: "vendor-id-1", name: "lookup_item", argumentsJson: '{"id":1}' },
      { id: "google-call-1", name: "count_items", argumentsJson: "{}" },
    ]);
    expect(extractGoogleToolCalls(undefined)).toEqual([]);
  });
});

describe("buildGoogleRequestParams", () => {
  it("carries systemInstruction, maxOutputTokens and the text mime type in config", () => {
    const params = buildGoogleRequestParams(settings());
    expect(params.model).toBe("gemini-2.5-flash");
    expect(params.config).toEqual({
      maxOutputTokens: 512,
      responseMimeType: "text/plain",
      systemInstruction: "Be brief.",
    });
  });

  it("uses application/json for json calls", () => {
    expect(buildGoogleRequestParams(settings({ responseFormat: "json" })).config?.responseMimeType).toBe(
      "application/json"
    );
  });

  it("passes temperature only when set", () => {
    expect(buildGoogleRequestParams(settings({ temperature: 0.2 })).config?.temperature).toBe(0.2);
    expect("temperature" in (buildGoogleRequestParams(settings()).config ?? {})).toBe(false);
  });

  it("includes tools in config only when the settings carry some", () => {
    const tools = [
      {
        type: "function" as const,
        name: "lookup_item",
        description: "d",
        parametersJsonSchema: { type: "object" },
        strict: false,
      },
    ];
    expect(buildGoogleRequestParams(settings({ tools })).config?.tools).toHaveLength(1);
    expect("tools" in (buildGoogleRequestParams(settings()).config ?? {})).toBe(false);
    expect("tools" in (buildGoogleRequestParams(settings({ tools: [] })).config ?? {})).toBe(false);
  });

  it("maps toolChoice onto functionCallingConfig — the layer's \"required\" is Gemini's ANY", () => {
    const tools = [
      {
        type: "function" as const,
        name: "lookup_item",
        description: "d",
        parametersJsonSchema: { type: "object" },
        strict: false,
      },
    ];
    expect(buildGoogleRequestParams(settings({ tools, toolChoice: "required" })).config?.toolConfig).toEqual({
      functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
    });
    expect(buildGoogleRequestParams(settings({ tools, toolChoice: "auto" })).config?.toolConfig).toEqual({
      functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
    });
    expect(buildGoogleRequestParams(settings({ tools, toolChoice: "none" })).config?.toolConfig).toEqual({
      functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
    });
    expect("toolConfig" in (buildGoogleRequestParams(settings({ tools })).config ?? {})).toBe(false);
  });
});

describe("normalizeGoogleFinishReason", () => {
  it.each([
    ["STOP", "stop"],
    ["MAX_TOKENS", "length"],
    ["SAFETY", "SAFETY"],
    [undefined, null],
  ] as const)("maps %s to %s", (finishReason, expected) => {
    expect(normalizeGoogleFinishReason(finishReason)).toBe(expected);
  });

  it("maps STOP with function calls present to tool_calls, and truncation stays length", () => {
    expect(normalizeGoogleFinishReason("STOP", true)).toBe("tool_calls");
    expect(normalizeGoogleFinishReason("MAX_TOKENS", true)).toBe("length");
  });
});

describe("classifyGoogleError", () => {
  it.each([
    // Gemini conflates rate limiting and exhausted quota in one 429; only a
    // message naming billing marks the quota flavor.
    [
      new ApiError({
        status: 429,
        message: "You exceeded your current quota, please check your plan and billing details.",
      }),
      "billing_quota",
    ],
    [new ApiError({ status: 402, message: "payment required" }), "billing_quota"],
    [new ApiError({ status: 429, message: "Resource has been exhausted (e.g. check quota)." }), "rate_limited"],
    [new ApiError({ status: 401, message: "API key not valid" }), "auth"],
    [new ApiError({ status: 403, message: "permission denied" }), "auth"],
    [new ApiError({ status: 500, message: "internal error" }), "unavailable"],
    [new ApiError({ status: 503, message: "The model is overloaded" }), "unavailable"],
    [Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }), "unavailable"],
    [new TypeError("fetch failed"), "unavailable"],
    [new ApiError({ status: 400, message: "invalid argument" }), "other"],
    [new Error("something else"), "other"],
  ] as const)("classifies %s as %s", (error, expected) => {
    expect(classifyGoogleError(error)).toBe(expected);
  });
});
