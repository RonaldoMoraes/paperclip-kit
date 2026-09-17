import { createXai } from "@ai-sdk/xai";
import {
  APICallError,
  type ModelMessage,
  RetryError,
  type ToolSet,
  generateText,
  jsonSchema,
  streamText,
  tool,
} from "ai";
import type { LlmToolCall, LlmToolChoice, LlmTurnMessage } from "../llm.types";
import { isAssistantToolCallMessage, isToolResultMessage } from "../llm.types";
import {
  HostedToolsUnsupportedError,
  JSON_STEERING_SENTENCE,
  type LlmProviderAdapter,
  type ProviderCallSettings,
  type ProviderErrorCategory,
  type ProviderResult,
  type ProviderStreamEvent,
  type ProviderTool,
} from "./provider.types";

export function convertMessagesForXai(messages: LlmTurnMessage[]): { system?: string; messages: ModelMessage[] } {
  const systemMessages: string[] = [];
  const rest: ModelMessage[] = [];
  for (const message of messages) {
    if (isToolResultMessage(message)) {
      rest.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            output: message.isError
              ? { type: "error-text", value: message.content }
              : { type: "text", value: message.content },
          },
        ],
      });
      continue;
    }
    if (isAssistantToolCallMessage(message)) {
      const trimmed = message.content.trim();
      rest.push({
        role: "assistant",
        content: [
          ...(trimmed ? [{ type: "text" as const, text: trimmed }] : []),
          ...message.toolCalls.map((call) => ({
            type: "tool-call" as const,
            toolCallId: call.id,
            toolName: call.name,
            input: JSON.parse(call.argumentsJson) as unknown,
          })),
        ],
      });
      continue;
    }
    const trimmed = message.content.trim();
    if (message.role === "system") {
      if (trimmed) systemMessages.push(trimmed);
      continue;
    }
    rest.push({ role: message.role, content: trimmed });
  }
  return { ...(systemMessages.length > 0 && { system: systemMessages.join("\n\n") }), messages: rest };
}

/** Execute-less tool set: the AI SDK then returns tool calls instead of running a loop of its own. */
export function buildXaiTools(tools: ProviderTool[]): ToolSet {
  return Object.fromEntries(
    tools.map((entry) => {
      if (entry.type !== "function") throw new HostedToolsUnsupportedError("xai");
      return [
        entry.name,
        tool({ description: entry.description, inputSchema: jsonSchema(entry.parametersJsonSchema) }),
      ];
    })
  );
}

export interface XaiCallSettings {
  system?: string;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens: number;
  maxRetries: 0;
  tools?: ToolSet;
  toolChoice?: LlmToolChoice;
}

export function buildXaiCallSettings(settings: ProviderCallSettings): XaiCallSettings {
  const converted = convertMessagesForXai(settings.messages);
  // No native JSON mode used — same system-prompt steering as Anthropic.
  const system =
    settings.responseFormat === "json"
      ? [converted.system, JSON_STEERING_SENTENCE].filter(Boolean).join("\n\n")
      : converted.system;
  return {
    messages: converted.messages,
    ...(system && { system }),
    ...(settings.temperature !== undefined && { temperature: settings.temperature }),
    maxOutputTokens: settings.maxOutputTokens,
    // The AI SDK retries internally by default and LlmService already owns retries.
    maxRetries: 0,
    ...(settings.tools && settings.tools.length > 0 && { tools: buildXaiTools(settings.tools) }),
    // The AI SDK speaks the layer's vocabulary ("auto" | "required" | "none") verbatim.
    ...(settings.toolChoice !== undefined && { toolChoice: settings.toolChoice }),
  };
}

/** The AI SDK already speaks "stop"/"length"; its "tool-calls" is normalized, anything else passes through raw. */
export function normalizeXaiFinishReason(finishReason: string | undefined): string | null {
  if (finishReason === "tool-calls") return "tool_calls";
  return finishReason ?? null;
}

/**
 * The AI SDK wraps HTTP failures in APICallError carrying the raw statusCode;
 * an APICallError with no statusCode never got a response (connection or
 * timeout failure). We call with maxRetries: 0, but a RetryError is unwrapped
 * to its last underlying error defensively.
 */
export function classifyXaiError(error: unknown): ProviderErrorCategory {
  const unwrapped = RetryError.isInstance(error) ? (error.lastError ?? error.errors.at(-1)) : error;
  if (!APICallError.isInstance(unwrapped)) return "other";
  const status = unwrapped.statusCode;
  if (status === undefined) return "unavailable";
  if (status === 402) return "billing_quota";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "unavailable";
  return "other";
}

export interface XaiProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export class XaiProvider implements LlmProviderAdapter {
  readonly name = "xai" as const;
  private readonly provider: ReturnType<typeof createXai>;

  constructor(config: XaiProviderConfig) {
    this.provider = createXai({ apiKey: config.apiKey, baseURL: config.baseUrl });
  }

  async complete(settings: ProviderCallSettings, signal?: AbortSignal): Promise<ProviderResult> {
    const result = await generateText({
      model: this.provider.responses(settings.model),
      ...buildXaiCallSettings(settings),
      ...(signal && { abortSignal: signal }),
    });
    const toolCalls: LlmToolCall[] = result.toolCalls.map((call) => ({
      id: call.toolCallId,
      name: call.toolName,
      argumentsJson: JSON.stringify(call.input ?? {}),
    }));
    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
      },
      finishReason: normalizeXaiFinishReason(result.finishReason),
      ...(toolCalls.length > 0 && { toolCalls }),
    };
  }

  async *stream(settings: ProviderCallSettings, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    const result = streamText({
      model: this.provider.responses(settings.model),
      ...buildXaiCallSettings(settings),
      ...(signal && { abortSignal: signal }),
    });
    for await (const delta of result.textStream) {
      yield { type: "delta", text: delta };
    }
    // Aborted streams end without a `done` event; the awaits below would hang
    // or reject on a cancelled call.
    if (signal?.aborted) return;
    const usage = await result.usage;
    const finishReason = await result.finishReason;
    yield {
      type: "done",
      usage: {
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
      },
      finishReason: normalizeXaiFinishReason(finishReason),
    };
  }

  classifyError(error: unknown): ProviderErrorCategory {
    return classifyXaiError(error);
  }
}
