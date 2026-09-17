import OpenAI, { APIConnectionError, APIError, APIUserAbortError } from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseInput,
  ResponseOutputItem,
  Tool,
} from "openai/resources/responses/responses";
import type { LlmToolCall, LlmTurnMessage } from "../llm.types";
import { isAssistantToolCallMessage, isToolResultMessage } from "../llm.types";
import type {
  LlmProviderAdapter,
  ProviderCallSettings,
  ProviderErrorCategory,
  ProviderResult,
  ProviderStreamEvent,
  ProviderTool,
} from "./provider.types";

/** gpt-5* are reasoning models: they reject `temperature`. */
export function isReasoningModel(model: string): boolean {
  return model.startsWith("gpt-5");
}

export function convertMessagesForOpenAi(messages: LlmTurnMessage[]): ResponseInput {
  return messages.flatMap((message): ResponseInput => {
    // A tool result replays as a function_call_output item keyed by call_id.
    // The Responses API has no error flag on it — the content carries the story.
    if (isToolResultMessage(message)) {
      return [{ type: "function_call_output", call_id: message.toolCallId, output: message.content }];
    }
    // An assistant tool-call turn replays as its prose (when any) followed by
    // one function_call item per call, arguments as the raw JSON string.
    if (isAssistantToolCallMessage(message)) {
      const trimmed = message.content.trim();
      return [
        ...(trimmed ? convertMessagesForOpenAi([{ role: "assistant", content: trimmed }]) : []),
        ...message.toolCalls.map(
          (call) =>
            ({ type: "function_call", call_id: call.id, name: call.name, arguments: call.argumentsJson }) as const
        ),
      ];
    }
    const trimmed = message.content.trim();
    // Assistant turns replayed as input must be plain-string content — the
    // Responses API rejects `input_text` on assistant items ("Supported values
    // are: 'output_text' and 'refusal'"); a plain string lets the API store the
    // text as `output_text` based on the role.
    if (message.role === "assistant") {
      return [{ role: "assistant", content: trimmed, type: "message" }];
    }
    return [{ role: message.role, content: [{ type: "input_text", text: trimmed }], type: "message" }];
  });
}

/**
 * Hosted descriptors pass through to the Responses API, which runs them
 * vendor-side within the call; the product-side `name` on file_search is not
 * sent — the vendor descriptor has no such field.
 */
export function buildOpenAiTools(tools: ProviderTool[]): Tool[] {
  return tools.map((tool): Tool => {
    if (tool.type === "function") {
      return {
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.parametersJsonSchema,
        strict: tool.strict,
      };
    }
    if (tool.type === "file_search") {
      return {
        type: "file_search",
        vector_store_ids: tool.vectorStoreIds,
        ...(tool.maxNumResults !== undefined && { max_num_results: tool.maxNumResults }),
      };
    }
    return {
      type: "web_search",
      ...(tool.searchContextSize !== undefined && { search_context_size: tool.searchContextSize }),
    };
  });
}

export function buildOpenAiRequestParams(
  settings: ProviderCallSettings
): Omit<ResponseCreateParamsNonStreaming, "stream"> {
  // One `text` object carries both concerns: the JSON steering format and the
  // reasoning-model verbosity knob. The reasoning knobs mirror the temperature
  // rule in reverse — only gpt-5* models accept them.
  const text = {
    // Native strict json_schema when the service derived one; json_object
    // steering otherwise — same fallback the other providers always take.
    ...(settings.responseFormat === "json" && {
      format: settings.jsonSchema
        ? {
            type: "json_schema" as const,
            name: settings.jsonSchema.name,
            schema: settings.jsonSchema.schema,
            strict: true,
          }
        : { type: "json_object" as const },
    }),
    ...(settings.textVerbosity !== undefined &&
      isReasoningModel(settings.model) && { verbosity: settings.textVerbosity }),
  };
  return {
    model: settings.model,
    input: convertMessagesForOpenAi(settings.messages),
    max_output_tokens: settings.maxOutputTokens,
    ...(settings.temperature !== undefined &&
      !isReasoningModel(settings.model) && { temperature: settings.temperature }),
    ...(settings.reasoningEffort !== undefined &&
      isReasoningModel(settings.model) && { reasoning: { effort: settings.reasoningEffort } }),
    ...(Object.keys(text).length > 0 && { text }),
    ...(settings.tools && settings.tools.length > 0 && { tools: buildOpenAiTools(settings.tools) }),
    // The Responses API speaks the layer's vocabulary ("auto" | "required" | "none") verbatim.
    ...(settings.toolChoice !== undefined && { tool_choice: settings.toolChoice }),
  };
}

/** Function calls the model wants run. Hosted-tool calls (file_search_call, web_search_call) ran vendor-side and are not surfaced. */
export function extractOpenAiToolCalls(output: ResponseOutputItem[] | undefined): LlmToolCall[] {
  return (output ?? [])
    .filter((item): item is Extract<ResponseOutputItem, { type: "function_call" }> => item.type === "function_call")
    .map((item) => ({ id: item.call_id, name: item.name, argumentsJson: item.arguments }));
}

export function normalizeOpenAiFinishReason(
  status: string | undefined,
  incompleteReason: string | undefined,
  hasToolCalls = false
): string | null {
  if (status === "completed") return hasToolCalls ? "tool_calls" : "stop";
  if (status === "incomplete" && incompleteReason === "max_output_tokens") return "length";
  return status ?? null;
}

/**
 * OpenAI signals exhausted credit as a 429 whose `error.code` is
 * "insufficient_quota" — check the code before the status, or billing failures
 * masquerade as rate limits. APIConnectionError (timeouts included) subclasses
 * APIError with no status, so it is matched first.
 */
export function classifyOpenAiError(error: unknown): ProviderErrorCategory {
  if (error instanceof APIConnectionError) return "unavailable";
  if (error instanceof APIError) {
    if (error.code === "insufficient_quota" || error.status === 402) return "billing_quota";
    if (error.status === 429) return "rate_limited";
    if (error.status === 401 || error.status === 403) return "auth";
    if (error.status !== undefined && error.status >= 500) return "unavailable";
  }
  return "other";
}

export interface OpenAiProviderConfig {
  apiKey: string;
}

export class OpenAiProvider implements LlmProviderAdapter {
  readonly name = "openai" as const;
  private readonly client: OpenAI;

  constructor(config: OpenAiProviderConfig) {
    // 12 minutes — reasoning-model headroom.
    this.client = new OpenAI({ apiKey: config.apiKey, timeout: 720_000 });
  }

  async complete(settings: ProviderCallSettings, signal?: AbortSignal): Promise<ProviderResult> {
    const response = await this.client.responses.create(buildOpenAiRequestParams(settings), { signal });
    const toolCalls = extractOpenAiToolCalls(response.output);
    return {
      text: response.output_text ?? "",
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
      finishReason: normalizeOpenAiFinishReason(
        response.status,
        response.incomplete_details?.reason,
        toolCalls.length > 0
      ),
      ...(toolCalls.length > 0 && { toolCalls }),
    };
  }

  async *stream(settings: ProviderCallSettings, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    const stream = this.client.responses.stream(buildOpenAiRequestParams(settings), { signal });
    try {
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          yield { type: "delta", text: event.delta };
        }
      }
      const final = await stream.finalResponse();
      yield {
        type: "done",
        usage: {
          inputTokens: final.usage?.input_tokens ?? null,
          outputTokens: final.usage?.output_tokens ?? null,
        },
        finishReason: normalizeOpenAiFinishReason(final.status, final.incomplete_details?.reason),
      };
    } catch (error) {
      // On abort the SDK throws its user-abort error — end the iterator
      // without a `done` event; the service records "aborted".
      if (error instanceof APIUserAbortError) return;
      throw error;
    }
  }

  classifyError(error: unknown): ProviderErrorCategory {
    return classifyOpenAiError(error);
  }
}
