import type { ZodType } from "zod";

/**
 * Logical service names — the registry's keys (`llm.config.ts`). Grows one literal per
 * feature that calls a model: the feature names the service, the registry names the
 * provider, model and chain behind it.
 */
export type LlmServiceName = "example-summary" | "example-chat";

export type LlmProviderName = "openai" | "anthropic" | "google" | "xai" | "fake";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * One tool invocation the model requested. Plain JSON — the agent loop and any
 * conversation store keep these as-is; no vendor type crosses out of providers/.
 */
export interface LlmToolCall {
  /** Vendor call id (minted by the adapter when the vendor omits one); echoed on the matching tool-result message. */
  id: string;
  name: string;
  /** JSON-encoded arguments exactly as the model produced them; the caller parses and Zod-validates. */
  argumentsJson: string;
}

/** An assistant turn that requested tool calls; `content` carries any accompanying prose ("" when none). */
export interface LlmAssistantToolCallMessage {
  role: "assistant";
  content: string;
  toolCalls: LlmToolCall[];
}

/** The result of one executed tool call, replayed to the model on the next turn. */
export interface LlmToolResultMessage {
  role: "tool";
  toolCallId: string;
  toolName: string;
  content: string;
  /** Marks a failed execution where the vendor has a flag for it (Anthropic, xAI, Google); OpenAI gets the content as-is. */
  isError?: boolean;
}

/** The tool-aware conversation vocabulary; plain LlmMessage stays valid everywhere. */
export type LlmTurnMessage = LlmMessage | LlmAssistantToolCallMessage | LlmToolResultMessage;

export function isToolResultMessage(message: LlmTurnMessage): message is LlmToolResultMessage {
  return message.role === "tool";
}

export function isAssistantToolCallMessage(message: LlmTurnMessage): message is LlmAssistantToolCallMessage {
  return message.role === "assistant" && "toolCalls" in message;
}

/** A product-defined tool the agent loop executes. Zod is the single parameter-schema source. */
export interface LlmFunctionTool {
  type: "function";
  name: string;
  description: string;
  /** Adapters receive a JSON-Schema derivation of this; the Zod schema stays the one source. */
  parameters: ZodType;
}

/** OpenAI-hosted retrieval, executed vendor-side within one model call. Hosted tools are OpenAI-only. */
export interface LlmFileSearchTool {
  type: "file_search";
  /** Product-side label (recording, telemetry); the vendor descriptor has no name field. */
  name: string;
  vectorStoreIds: string[];
  maxNumResults?: number;
}

/** OpenAI-hosted web search, executed vendor-side within one model call. Hosted tools are OpenAI-only. */
export interface LlmWebSearchTool {
  type: "web_search";
  /** Vendor knob for how much page content each search pulls in; omitted = the vendor's default ("medium"). */
  searchContextSize?: "low" | "medium" | "high";
}

export type LlmHostedTool = LlmFileSearchTool | LlmWebSearchTool;
export type LlmTool = LlmFunctionTool | LlmHostedTool;

export function isHostedTool(tool: LlmTool): tool is LlmHostedTool {
  return tool.type !== "function";
}

/**
 * OpenAI reasoning-model knobs (gpt-5*), declared per registry route. The
 * OpenAI adapter forwards them; every other adapter ignores them — they shape
 * cost/latency, never correctness, so a non-OpenAI route losing them is safe.
 */
export type LlmReasoningEffort = "minimal" | "low" | "medium" | "high";
export type LlmTextVerbosity = "low" | "medium" | "high";

/**
 * Whether the model may ("auto"), must ("required") or must not ("none") call
 * the tools a request carries. Unlike the reasoning knobs, every vendor adapter
 * maps it. It exists only on tool-carrying turn calls: the prompt/structured/
 * stream paths never carry tools, so a route-level value does not reach them,
 * and a turn call whose effective choice is "required" but carries no tools
 * fails fast as a configuration error. Loop semantics: the AgentRunner
 * downgrades to "auto" after an agent's first tool-bearing turn, so "required"
 * means "use a tool at least once" — left standing it would force tool calls on
 * every turn and the run could never produce a final answer.
 */
export type LlmToolChoice = "auto" | "required" | "none";

export interface LlmCallOverrides {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmRequest {
  /** Which registry entry routes this call (provider, model, defaults). */
  service: LlmServiceName;
  messages: LlmMessage[];
  /** Caller correlation id (conversation id, record id, …). Telemetry only. */
  referenceId?: string;
  overrides?: LlmCallOverrides;
  /**
   * Aborting cancels the upstream vendor request. Non-stream paths reject with
   * LlmError("aborted") — never a retry, never a failover.
   */
  signal?: AbortSignal;
}

export interface LlmStructuredRequest<T> extends LlmRequest {
  /** Validation is the default path, not optional — the schema is required. */
  schema: ZodType<T>;
  /** Bounded repair loop on invalid output. Default 1. */
  maxRepairAttempts?: number;
}

export interface LlmStreamRequest extends LlmRequest {
  /**
   * Aborting cancels the upstream vendor request. The iterator then completes
   * without error (no `done` chunk) — client disconnect is not an exception.
   */
  signal?: AbortSignal;
}

/**
 * One tool-aware model turn. Not an LlmRequest extension: the conversation may
 * carry tool traffic, so `messages` widens to the turn vocabulary.
 */
export interface LlmTurnRequest {
  service: LlmServiceName;
  /** The whole conversation so far, tool calls and results included. */
  messages: LlmTurnMessage[];
  /** Function tools the caller executes, plus hosted descriptors (OpenAI-only routes). */
  tools: LlmTool[];
  /**
   * Overrides the route's registry toolChoice for this turn — the AgentRunner's
   * downgrade seam (see LlmToolChoice). Sent to the vendor only when `tools` is
   * non-empty; an effective "required" on a tool-less turn fails fast.
   */
  toolChoice?: LlmToolChoice;
  referenceId?: string;
  overrides?: LlmCallOverrides;
  /** Same abort contract as LlmRequest: rejection with LlmError("aborted"). */
  signal?: AbortSignal;
  /**
   * "json" steers the final answer to JSON — native strict json_schema on
   * OpenAI when `jsonSchema` rides along, the provider's JSON steering
   * otherwise. Tool calling is unaffected: the format constrains only the
   * text the model answers with. Default "text".
   */
  responseFormat?: "text" | "json";
  /** The derived strict schema for the final answer; present only with responseFormat "json". */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

/**
 * A turn ends in the model's final text or in the tool calls it wants executed;
 * `text` on a tool_calls result is any accompanying prose ("" when none), which
 * the caller replays on the assistant tool-call message.
 */
export type LlmTurnResult =
  | { type: "final"; text: string; usage: LlmUsage; model: string }
  | { type: "tool_calls"; toolCalls: LlmToolCall[]; text: string; usage: LlmUsage; model: string };

export interface LlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export type LlmStreamChunk =
  | { type: "delta"; text: string }
  | { type: "done"; fullText: string; usage: LlmUsage; model: string };

export type LlmErrorCode =
  | "configuration" // missing key, unknown service, bad registry entry, hosted tools on a non-OpenAI route
  | "provider_error" // vendor call failed after retries
  | "empty_response" // vendor answered with no usable text after retries
  | "invalid_structured_output" // schema validation failed after the repair loop
  | "max_turns_exceeded" // an agent run (llm/agents) hit its turn bound without a final answer
  | "aborted"; // the caller's signal fired on a non-stream path (streams end quietly instead)

/** One provider/model position a failover chain actually ran against. */
export interface LlmAttemptedRoute {
  provider: LlmProviderName;
  model: string;
}

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly context: {
      service: LlmServiceName;
      provider?: LlmProviderName;
      model?: string;
      /** Every provider/model tried, in chain order, when the attempt machinery ran. */
      attemptedRoutes?: LlmAttemptedRoute[];
    },
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "LlmError";
  }
}

export interface LlmClient {
  /** Full text response. Never null — failure is a thrown LlmError. */
  processPrompt(request: LlmRequest): Promise<string>;
  /** Zod-validated T with response cleaning and a bounded repair loop. */
  processStructuredPrompt<T>(request: LlmStructuredRequest<T>): Promise<T>;
  /** Text deltas ending in one `done` chunk carrying usage. Abort-aware. */
  streamPrompt(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk>;
  /** One tool-aware turn: the model's final text or the tool calls it wants run, with usage. */
  processTurn(request: LlmTurnRequest): Promise<LlmTurnResult>;
}

/**
 * Consumers depend on this token, never on the class behind it:
 * `constructor(@Inject(LLM_CLIENT) private readonly llm: LlmClient) {}`.
 */
export const LLM_CLIENT = Symbol("LLM_CLIENT");
