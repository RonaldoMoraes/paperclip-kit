import Anthropic, { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  ContentBlockParam,
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlock,
  Tool,
  ToolChoice,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { LlmToolCall, LlmTurnMessage } from "../llm.types";
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

export function convertMessagesForAnthropic(messages: LlmTurnMessage[]): { system?: string; messages: MessageParam[] } {
  const systemMessages: string[] = [];
  const rest: MessageParam[] = [];
  for (const message of messages) {
    // Every tool_result for an assistant tool_use turn must sit in the one
    // user message that follows it — consecutive tool results coalesce into
    // that message instead of opening a new turn each.
    if (isToolResultMessage(message)) {
      const block: ContentBlockParam = {
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
        ...(message.isError && { is_error: true }),
      };
      const previous = rest.at(-1);
      if (previous?.role === "user" && Array.isArray(previous.content)) {
        previous.content.push(block);
      } else {
        rest.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (isAssistantToolCallMessage(message)) {
      const trimmed = message.content.trim();
      rest.push({
        role: "assistant",
        content: [
          ...(trimmed ? [{ type: "text" as const, text: trimmed }] : []),
          ...message.toolCalls.map((call) => ({
            type: "tool_use" as const,
            id: call.id,
            name: call.name,
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

/** The Messages API takes an object, not a string; the layer's "required" is its "any". */
const ANTHROPIC_TOOL_CHOICE: Record<NonNullable<ProviderCallSettings["toolChoice"]>, ToolChoice> = {
  auto: { type: "auto" },
  required: { type: "any" },
  none: { type: "none" },
};

export function buildAnthropicTools(tools: ProviderTool[]): Tool[] {
  return tools.map((tool): Tool => {
    if (tool.type !== "function") throw new HostedToolsUnsupportedError("anthropic");
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parametersJsonSchema as Tool.InputSchema,
    };
  });
}

export function buildAnthropicRequestParams(settings: ProviderCallSettings): MessageCreateParamsNonStreaming {
  const converted = convertMessagesForAnthropic(settings.messages);
  // No native JSON mode — steer via the system prompt; the service's cleaning
  // layer handles any fences that slip through.
  const system =
    settings.responseFormat === "json"
      ? [converted.system, JSON_STEERING_SENTENCE].filter(Boolean).join("\n\n")
      : converted.system;
  return {
    model: settings.model,
    // Required on every request by the Messages API.
    max_tokens: settings.maxOutputTokens,
    messages: converted.messages,
    ...(system && { system }),
    // Only when present: recent Claude models reject temperature outright.
    ...(settings.temperature !== undefined && { temperature: settings.temperature }),
    ...(settings.tools && settings.tools.length > 0 && { tools: buildAnthropicTools(settings.tools) }),
    ...(settings.toolChoice !== undefined && { tool_choice: ANTHROPIC_TOOL_CHOICE[settings.toolChoice] }),
  };
}

export function extractAnthropicToolCalls(content: ContentBlock[]): LlmToolCall[] {
  return content
    .filter((block): block is Extract<ContentBlock, { type: "tool_use" }> => block.type === "tool_use")
    .map((block) => ({ id: block.id, name: block.name, argumentsJson: JSON.stringify(block.input ?? {}) }));
}

export function normalizeAnthropicStopReason(stopReason: string | null): string | null {
  if (stopReason === "end_turn") return "stop";
  if (stopReason === "max_tokens") return "length";
  if (stopReason === "tool_use") return "tool_calls";
  return stopReason;
}

/**
 * Anthropic has no 402: exhausted credit arrives as a 400 invalid_request_error
 * whose message names the credit balance ("Your credit balance is too low…") —
 * the message check is the only billing signal the API gives. 529
 * overloaded_error lands in the >= 500 bucket. APIConnectionError (timeouts
 * included) subclasses APIError with no status, so it is matched first.
 */
export function classifyAnthropicError(error: unknown): ProviderErrorCategory {
  if (error instanceof APIConnectionError) return "unavailable";
  if (error instanceof APIError) {
    if (error.status === 402 || (error.status === 400 && /credit balance/i.test(error.message))) {
      return "billing_quota";
    }
    if (error.status === 429) return "rate_limited";
    if (error.status === 401 || error.status === 403) return "auth";
    if (error.status !== undefined && error.status >= 500) return "unavailable";
  }
  return "other";
}

export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export class AnthropicProvider implements LlmProviderAdapter {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 720_000 });
  }

  async complete(settings: ProviderCallSettings, signal?: AbortSignal): Promise<ProviderResult> {
    const response = await this.client.messages.create(buildAnthropicRequestParams(settings), { signal });
    const text = response.content
      .filter((block): block is TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const toolCalls = extractAnthropicToolCalls(response.content);
    return {
      text,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
      finishReason: normalizeAnthropicStopReason(response.stop_reason),
      ...(toolCalls.length > 0 && { toolCalls }),
    };
  }

  async *stream(settings: ProviderCallSettings, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    // The signal cancels the underlying request; the service maps the thrown
    // abort error to its "aborted" outcome.
    const stream = this.client.messages.stream(buildAnthropicRequestParams(settings), { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "delta", text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    yield {
      type: "done",
      usage: {
        inputTokens: final.usage?.input_tokens ?? null,
        outputTokens: final.usage?.output_tokens ?? null,
      },
      finishReason: normalizeAnthropicStopReason(final.stop_reason),
    };
  }

  classifyError(error: unknown): ProviderErrorCategory {
    return classifyAnthropicError(error);
  }
}
