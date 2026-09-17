import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import type { ResponseOutputItem } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";
import type { LlmMessage } from "../llm.types";
import {
  buildOpenAiRequestParams,
  buildOpenAiTools,
  classifyOpenAiError,
  convertMessagesForOpenAi,
  extractOpenAiToolCalls,
  isReasoningModel,
  normalizeOpenAiFinishReason,
} from "./openai.provider";
import type { ProviderCallSettings } from "./provider.types";

const settings = (overrides: Partial<ProviderCallSettings> = {}): ProviderCallSettings => ({
  model: "gpt-4.1",
  messages: [{ role: "user", content: "hello" }],
  maxOutputTokens: 256,
  responseFormat: "text",
  ...overrides,
});

describe("convertMessagesForOpenAi", () => {
  it("maps system and user messages to input_text content parts", () => {
    const messages: LlmMessage[] = [
      { role: "system", content: "Be brief. " },
      { role: "user", content: "hello" },
    ];
    expect(convertMessagesForOpenAi(messages)).toEqual([
      { role: "system", content: [{ type: "input_text", text: "Be brief." }], type: "message" },
      { role: "user", content: [{ type: "input_text", text: "hello" }], type: "message" },
    ]);
  });

  it("replays assistant turns as plain-string content, never input_text", () => {
    expect(convertMessagesForOpenAi([{ role: "assistant", content: "earlier answer " }])).toEqual([
      { role: "assistant", content: "earlier answer", type: "message" },
    ]);
  });

  it("replays an assistant tool-call turn as its prose followed by one function_call item per call", () => {
    expect(
      convertMessagesForOpenAi([
        {
          role: "assistant",
          content: "checking the item",
          toolCalls: [
            { id: "call-1", name: "lookup_item", argumentsJson: '{"id":1}' },
            { id: "call-2", name: "count_items", argumentsJson: "{}" },
          ],
        },
      ])
    ).toEqual([
      { role: "assistant", content: "checking the item", type: "message" },
      { type: "function_call", call_id: "call-1", name: "lookup_item", arguments: '{"id":1}' },
      { type: "function_call", call_id: "call-2", name: "count_items", arguments: "{}" },
    ]);
  });

  it("omits the assistant message item when a tool-call turn carries no prose", () => {
    expect(
      convertMessagesForOpenAi([
        { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "lookup_item", argumentsJson: "{}" }] },
      ])
    ).toEqual([{ type: "function_call", call_id: "call-1", name: "lookup_item", arguments: "{}" }]);
  });

  it("replays a tool result as a function_call_output item keyed by call_id", () => {
    expect(
      convertMessagesForOpenAi([{ role: "tool", toolCallId: "call-1", toolName: "lookup_item", content: "item one" }])
    ).toEqual([{ type: "function_call_output", call_id: "call-1", output: "item one" }]);
  });
});

describe("buildOpenAiTools", () => {
  it("maps a function tool with its derived schema and strict flag", () => {
    const parametersJsonSchema = { type: "object", properties: {}, additionalProperties: false };
    expect(
      buildOpenAiTools([
        { type: "function", name: "lookup_item", description: "Reads one item.", parametersJsonSchema, strict: true },
      ])
    ).toEqual([
      {
        type: "function",
        name: "lookup_item",
        description: "Reads one item.",
        parameters: parametersJsonSchema,
        strict: true,
      },
    ]);
  });

  it("passes hosted tools through, dropping the product-side file_search name", () => {
    expect(
      buildOpenAiTools([
        { type: "file_search", name: "product-docs", vectorStoreIds: ["vs_1", "vs_2"], maxNumResults: 8 },
        { type: "file_search", name: "handbook", vectorStoreIds: ["vs_3"] },
        { type: "web_search" },
      ])
    ).toEqual([
      { type: "file_search", vector_store_ids: ["vs_1", "vs_2"], max_num_results: 8 },
      { type: "file_search", vector_store_ids: ["vs_3"] },
      { type: "web_search" },
    ]);
  });

  it("passes the web_search context size through when set", () => {
    expect(buildOpenAiTools([{ type: "web_search", searchContextSize: "low" }])).toEqual([
      { type: "web_search", search_context_size: "low" },
    ]);
  });
});

describe("extractOpenAiToolCalls", () => {
  it("surfaces function_call items and ignores messages and vendor-executed hosted calls", () => {
    const output = [
      { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [] },
      { type: "file_search_call", id: "fsc_1", queries: [], status: "completed" },
      { type: "function_call", id: "fc_1", call_id: "call-1", name: "lookup_item", arguments: '{"id":1}' },
    ] as ResponseOutputItem[];
    expect(extractOpenAiToolCalls(output)).toEqual([{ id: "call-1", name: "lookup_item", argumentsJson: '{"id":1}' }]);
    expect(extractOpenAiToolCalls(undefined)).toEqual([]);
  });
});

describe("buildOpenAiRequestParams", () => {
  it("passes temperature and max_output_tokens for standard models", () => {
    const params = buildOpenAiRequestParams(settings({ temperature: 0.4 }));
    expect(params).toMatchObject({ model: "gpt-4.1", temperature: 0.4, max_output_tokens: 256 });
  });

  it("omits temperature for gpt-5 reasoning models", () => {
    expect(isReasoningModel("gpt-5-mini")).toBe(true);
    expect(isReasoningModel("gpt-4.1")).toBe(false);
    const params = buildOpenAiRequestParams(settings({ model: "gpt-5-mini", temperature: 0.4 }));
    expect("temperature" in params).toBe(false);
  });

  it("omits temperature when unset", () => {
    expect("temperature" in buildOpenAiRequestParams(settings())).toBe(false);
  });

  it("applies json_object format only for json calls", () => {
    expect(buildOpenAiRequestParams(settings({ responseFormat: "json" })).text).toEqual({
      format: { type: "json_object" },
    });
    expect("text" in buildOpenAiRequestParams(settings())).toBe(false);
  });

  it("upgrades json calls to native strict json_schema when the service derived one", () => {
    const schema = { type: "object", properties: { score: { type: "number" } }, required: ["score"] };
    const params = buildOpenAiRequestParams(
      settings({ responseFormat: "json", jsonSchema: { name: "structured_output", schema } })
    );
    expect(params.text).toEqual({
      format: { type: "json_schema", name: "structured_output", schema, strict: true },
    });
  });

  it("forwards the reasoning knobs to gpt-5 models and withholds them from the rest", () => {
    const reasoning = buildOpenAiRequestParams(
      settings({ model: "gpt-5.4-mini", reasoningEffort: "low", textVerbosity: "low" })
    );
    expect(reasoning.reasoning).toEqual({ effort: "low" });
    expect(reasoning.text).toEqual({ verbosity: "low" });

    // gpt-4.1: the knobs exist only on reasoning models — same rule as temperature, inverted.
    const standard = buildOpenAiRequestParams(settings({ reasoningEffort: "low", textVerbosity: "low" }));
    expect("reasoning" in standard).toBe(false);
    expect("text" in standard).toBe(false);

    const bare = buildOpenAiRequestParams(settings({ model: "gpt-5.4-mini" }));
    expect("reasoning" in bare).toBe(false);
    expect("text" in bare).toBe(false);
  });

  it("merges verbosity and the json format onto one text object", () => {
    const params = buildOpenAiRequestParams(
      settings({ model: "gpt-5.4-mini", responseFormat: "json", textVerbosity: "low" })
    );
    expect(params.text).toEqual({ format: { type: "json_object" }, verbosity: "low" });
  });

  it("includes tools only when the settings carry some", () => {
    const params = buildOpenAiRequestParams(settings({ tools: [{ type: "web_search" }] }));
    expect(params.tools).toEqual([{ type: "web_search" }]);
    expect("tools" in buildOpenAiRequestParams(settings())).toBe(false);
    expect("tools" in buildOpenAiRequestParams(settings({ tools: [] }))).toBe(false);
  });

  it("maps toolChoice straight onto tool_choice — the Responses API speaks the same vocabulary", () => {
    const tools = [{ type: "web_search" as const }];
    expect(buildOpenAiRequestParams(settings({ tools, toolChoice: "required" })).tool_choice).toBe("required");
    expect(buildOpenAiRequestParams(settings({ tools, toolChoice: "none" })).tool_choice).toBe("none");
    expect("tool_choice" in buildOpenAiRequestParams(settings({ tools }))).toBe(false);
  });
});

describe("normalizeOpenAiFinishReason", () => {
  it.each([
    ["completed", undefined, "stop"],
    ["incomplete", "max_output_tokens", "length"],
    ["incomplete", "content_filter", "incomplete"],
    ["failed", undefined, "failed"],
    [undefined, undefined, null],
  ] as const)("maps status %s / %s to %s", (status, incompleteReason, expected) => {
    expect(normalizeOpenAiFinishReason(status, incompleteReason)).toBe(expected);
  });

  it("maps a completed response that carries function calls to tool_calls", () => {
    expect(normalizeOpenAiFinishReason("completed", undefined, true)).toBe("tool_calls");
    // Truncation outranks the calls: an incomplete tool turn is still a retryable "length".
    expect(normalizeOpenAiFinishReason("incomplete", "max_output_tokens", true)).toBe("length");
  });
});

describe("classifyOpenAiError", () => {
  const apiError = (status: number, body: Record<string, unknown> = {}): APIError =>
    APIError.generate(status, { error: body }, undefined, new Headers());

  it.each([
    // Exhausted credit is a 429 whose error.code is insufficient_quota — the
    // code outranks the status, or billing failures read as rate limits.
    [apiError(429, { code: "insufficient_quota", message: "You exceeded your current quota" }), "billing_quota"],
    [apiError(402, { message: "payment required" }), "billing_quota"],
    [apiError(429, { code: "rate_limit_exceeded", message: "Rate limit reached" }), "rate_limited"],
    [apiError(401, { message: "Incorrect API key provided" }), "auth"],
    [apiError(403, { message: "not allowed" }), "auth"],
    [apiError(500, { message: "server error" }), "unavailable"],
    [apiError(503, { message: "overloaded" }), "unavailable"],
    [new APIConnectionError({ message: "Connection error." }), "unavailable"],
    [new APIConnectionTimeoutError(), "unavailable"],
    [apiError(404, { message: "model not found" }), "other"],
    [apiError(400, { message: "bad request" }), "other"],
    [new Error("something else"), "other"],
  ] as const)("classifies %s as %s", (error, expected) => {
    expect(classifyOpenAiError(error)).toBe(expected);
  });
});
