import type {
  LlmHostedTool,
  LlmProviderName,
  LlmReasoningEffort,
  LlmTextVerbosity,
  LlmToolCall,
  LlmToolChoice,
  LlmTurnMessage,
  LlmUsage,
} from "../llm.types";

/**
 * A function tool as adapters see it: parameters already derived to JSON
 * Schema by the service (json-schema.ts) — Zod never crosses the port.
 */
export interface ProviderFunctionTool {
  type: "function";
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
  /** True when the schema qualifies for vendor strict validation (all-required object tree). */
  strict: boolean;
}

export type ProviderTool = ProviderFunctionTool | LlmHostedTool;

export interface ProviderCallSettings {
  model: string;
  messages: LlmTurnMessage[];
  maxOutputTokens: number;
  /** Passed to the vendor only when present (some models reject it). */
  temperature?: number;
  /** "json": the adapter applies its provider's JSON steering. */
  responseFormat: "text" | "json";
  /**
   * Native strict json_schema output for adapters that support it (openai);
   * the others ignore it and keep their JSON steering unchanged. Present only
   * with responseFormat "json".
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Present only on tool-aware turns. Hosted entries reach the OpenAI adapter alone (service-enforced). */
  tools?: ProviderTool[];
  /**
   * Present only alongside `tools` (service-enforced — the vendors reject the
   * combination without them): the model may ("auto"), must ("required") or
   * must not ("none") call them. Every adapter maps it to its vendor's
   * equivalent.
   */
  toolChoice?: LlmToolChoice;
  /**
   * OpenAI reasoning-model knobs: the OpenAI adapter forwards them to gpt-5*
   * models; every other adapter ignores them (cost/latency shaping only).
   */
  reasoningEffort?: LlmReasoningEffort;
  textVerbosity?: LlmTextVerbosity;
}

export interface ProviderResult {
  text: string;
  usage: LlmUsage;
  /**
   * Normalized: "stop" (natural end) | "length" (truncated) | "tool_calls"
   * (the model stopped to call function tools) | raw vendor string.
   */
  finishReason: string | null;
  /** The function calls behind a "tool_calls" finish; hosted tools ran vendor-side and never appear here. */
  toolCalls?: LlmToolCall[];
}

export type ProviderStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: LlmUsage; finishReason: string | null };

/**
 * Why a thrown vendor error failed, as far as failover is concerned.
 * Classification lives in the adapters — they know their SDK's error shapes;
 * the service only decides what to do with the category.
 */
export type ProviderErrorCategory =
  | "billing_quota" // 402 / insufficient_quota / credit exhausted
  | "rate_limited" // 429
  | "unavailable" // 5xx, connection and timeout failures
  | "auth" // 401/403 — a dead key makes the provider unusable
  | "other"; // everything else — not a provider-health signal

/**
 * Dumb transport: message conversion, parameter mapping, usage extraction.
 * No retries, no validation, no repair, no logging, no defaulting — that loop
 * exists once, in LlmService. Adapters throw the raw vendor error (the service
 * wraps it) and treat truncation as `finishReason: "length"`, not an error.
 */
export interface LlmProviderAdapter {
  readonly name: LlmProviderName;
  complete(settings: ProviderCallSettings, signal?: AbortSignal): Promise<ProviderResult>;
  stream(settings: ProviderCallSettings, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent>;
  /** Categorize a thrown vendor error for the service's failover policy. Never throws. */
  classifyError(error: unknown): ProviderErrorCategory;
}

/**
 * Thrown by adapters whose vendor cannot run provider-hosted tools
 * (file_search/web_search are OpenAI-only). The service's chain guard makes
 * this unreachable in practice — it exists so a mis-wired call fails loudly
 * instead of sending a vendor an unknown tool shape.
 */
export class HostedToolsUnsupportedError extends Error {
  constructor(provider: LlmProviderName) {
    super(`[llm] provider "${provider}" cannot run provider-hosted tools — file_search/web_search are OpenAI-only.`);
    this.name = "HostedToolsUnsupportedError";
  }
}

/**
 * The prompt-steering sentence for providers without a native JSON mode
 * (anthropic, xai). Shared so the two adapters cannot drift apart; the
 * service's cleaning layer handles any fences that slip through anyway.
 */
export const JSON_STEERING_SENTENCE = "Return only valid JSON with no markdown fences or explanations.";
