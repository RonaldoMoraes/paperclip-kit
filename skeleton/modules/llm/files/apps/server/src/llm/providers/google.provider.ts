import {
  ApiError,
  type Content,
  FunctionCallingConfigMode,
  type GenerateContentParameters,
  GoogleGenAI,
  type Part,
  type Tool,
} from "@google/genai";
import type { LlmToolCall, LlmTurnMessage, LlmUsage } from "../llm.types";
import { isAssistantToolCallMessage, isToolResultMessage } from "../llm.types";
import {
  HostedToolsUnsupportedError,
  type LlmProviderAdapter,
  type ProviderCallSettings,
  type ProviderErrorCategory,
  type ProviderResult,
  type ProviderStreamEvent,
  type ProviderTool,
} from "./provider.types";

/**
 * Gemini does not reliably mint function-call ids; the adapter synthesizes one
 * under this prefix so the turn contract always carries an id, and strips it on
 * replay — echoing an id the vendor never issued is rejected.
 */
const SYNTHETIC_CALL_ID_PREFIX = "google-call-";

function realCallId(id: string): string | undefined {
  return id.startsWith(SYNTHETIC_CALL_ID_PREFIX) ? undefined : id;
}

export function convertMessagesForGoogle(messages: LlmTurnMessage[]): {
  systemInstruction?: string;
  contents: Content[];
} {
  const systemMessages: string[] = [];
  const contents: Content[] = [];
  for (const message of messages) {
    if (isToolResultMessage(message)) {
      const id = realCallId(message.toolCallId);
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.toolName,
              // The API reads "output"/"error" keys off the response object.
              response: message.isError ? { error: message.content } : { output: message.content },
              ...(id && { id }),
            },
          },
        ],
      });
      continue;
    }
    if (isAssistantToolCallMessage(message)) {
      const trimmed = message.content.trim();
      contents.push({
        role: "model",
        parts: [
          ...(trimmed ? [{ text: trimmed }] : []),
          ...message.toolCalls.map((call) => {
            const id = realCallId(call.id);
            return {
              functionCall: {
                name: call.name,
                args: JSON.parse(call.argumentsJson) as Record<string, unknown>,
                ...(id && { id }),
              },
            };
          }),
        ],
      });
      continue;
    }
    const trimmed = message.content.trim();
    // System messages join into `config.systemInstruction` — folding them into
    // `contents` as role "model" predates the SDK's system support and loses
    // system semantics.
    if (message.role === "system") {
      if (trimmed) systemMessages.push(trimmed);
      continue;
    }
    contents.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: trimmed }] });
  }
  return { ...(systemMessages.length > 0 && { systemInstruction: systemMessages.join("\n\n") }), contents };
}

/** Gemini's function-calling modes: the layer's "required" is its ANY (function calls only). */
const GOOGLE_TOOL_CHOICE_MODE: Record<NonNullable<ProviderCallSettings["toolChoice"]>, FunctionCallingConfigMode> = {
  auto: FunctionCallingConfigMode.AUTO,
  required: FunctionCallingConfigMode.ANY,
  none: FunctionCallingConfigMode.NONE,
};

export function buildGoogleTools(tools: ProviderTool[]): Tool[] {
  return [
    {
      functionDeclarations: tools.map((tool) => {
        if (tool.type !== "function") throw new HostedToolsUnsupportedError("google");
        // parametersJsonSchema is the SDK's plain-JSON-Schema field — the
        // OpenAPI-style `parameters` alternative would need a lossy rewrite.
        return { name: tool.name, description: tool.description, parametersJsonSchema: tool.parametersJsonSchema };
      }),
    },
  ];
}

export function buildGoogleRequestParams(settings: ProviderCallSettings): GenerateContentParameters {
  const converted = convertMessagesForGoogle(settings.messages);
  return {
    model: settings.model,
    contents: converted.contents,
    config: {
      maxOutputTokens: settings.maxOutputTokens,
      // Gemini is the provider most prone to fenced output even in JSON mode —
      // the service's cleaning layer exists largely for it.
      responseMimeType: settings.responseFormat === "json" ? "application/json" : "text/plain",
      ...(settings.temperature !== undefined && { temperature: settings.temperature }),
      ...(converted.systemInstruction && { systemInstruction: converted.systemInstruction }),
      ...(settings.tools && settings.tools.length > 0 && { tools: buildGoogleTools(settings.tools) }),
      ...(settings.toolChoice !== undefined && {
        toolConfig: { functionCallingConfig: { mode: GOOGLE_TOOL_CHOICE_MODE[settings.toolChoice] } },
      }),
    },
  };
}

export function extractGoogleToolCalls(parts: Part[] | undefined): LlmToolCall[] {
  return (parts ?? [])
    .filter((part) => part.functionCall !== undefined)
    .map((part, index) => ({
      id: part.functionCall?.id ?? `${SYNTHETIC_CALL_ID_PREFIX}${index}`,
      name: part.functionCall?.name ?? "",
      argumentsJson: JSON.stringify(part.functionCall?.args ?? {}),
    }));
}

export function normalizeGoogleFinishReason(finishReason: string | undefined, hasToolCalls = false): string | null {
  if (finishReason === "STOP") return hasToolCalls ? "tool_calls" : "stop";
  if (finishReason === "MAX_TOKENS") return "length";
  return finishReason ?? null;
}

function usageOf(usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined): LlmUsage {
  return {
    inputTokens: usageMetadata?.promptTokenCount ?? null,
    outputTokens: usageMetadata?.candidatesTokenCount ?? null,
  };
}

/**
 * Gemini conflates rate limiting and exhausted quota in one 429
 * RESOURCE_EXHAUSTED; the "check your plan and billing details" message is the
 * only billing signal, so a 429 naming billing classifies as billing_quota and
 * any other 429 as rate_limited (both are fallback-worthy — the split only
 * affects reporting). The SDK throws ApiError for HTTP failures; transport
 * failures surface as plain fetch/timeout errors, not ApiError.
 */
export function classifyGoogleError(error: unknown): ProviderErrorCategory {
  if (error instanceof ApiError) {
    if (error.status === 402) return "billing_quota";
    if (error.status === 429) return /billing/i.test(error.message) ? "billing_quota" : "rate_limited";
    if (error.status === 401 || error.status === 403) return "auth";
    if (error.status >= 500) return "unavailable";
    return "other";
  }
  if (error instanceof Error && (error.name === "TimeoutError" || /fetch failed|network/i.test(error.message))) {
    return "unavailable";
  }
  return "other";
}

export interface GoogleProviderConfig {
  apiKey: string;
}

export class GoogleProvider implements LlmProviderAdapter {
  readonly name = "google" as const;
  private readonly client: GoogleGenAI;

  constructor(config: GoogleProviderConfig) {
    // 30 minutes.
    this.client = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { timeout: 1_800_000 } });
  }

  async complete(settings: ProviderCallSettings, signal?: AbortSignal): Promise<ProviderResult> {
    const params = buildGoogleRequestParams(settings);
    const response = await this.client.models.generateContent({
      ...params,
      config: { ...params.config, ...(signal && { abortSignal: signal }) },
    });
    const candidate = response.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
    const toolCalls = extractGoogleToolCalls(candidate?.content?.parts);
    return {
      text,
      usage: usageOf(response.usageMetadata),
      finishReason: normalizeGoogleFinishReason(candidate?.finishReason, toolCalls.length > 0),
      ...(toolCalls.length > 0 && { toolCalls }),
    };
  }

  async *stream(settings: ProviderCallSettings, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    const params = buildGoogleRequestParams(settings);
    const stream = await this.client.models.generateContentStream({
      ...params,
      config: { ...params.config, ...(signal && { abortSignal: signal }) },
    });
    let usage: LlmUsage = { inputTokens: null, outputTokens: null };
    let finishReason: string | null = null;
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield { type: "delta", text };
      if (chunk.usageMetadata) usage = usageOf(chunk.usageMetadata);
      const reason = chunk.candidates?.[0]?.finishReason;
      if (reason) finishReason = normalizeGoogleFinishReason(reason);
    }
    yield { type: "done", usage, finishReason };
  }

  classifyError(error: unknown): ProviderErrorCategory {
    return classifyGoogleError(error);
  }
}
