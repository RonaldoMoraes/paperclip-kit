import {
  LlmError,
  type LlmProviderName,
  type LlmReasoningEffort,
  type LlmServiceName,
  type LlmTextVerbosity,
  type LlmToolChoice,
} from "./llm.types";

export interface LlmRouteConfig {
  provider: Exclude<LlmProviderName, "fake">; // fake is a mode, not a route
  model: string;
  maxOutputTokens: number; // required — Anthropic demands it; explicit everywhere
  temperature?: number; // omit for models that reject it
  /** OpenAI-only reasoning knobs; the adapter applies them to gpt-5* models and every other adapter ignores them. */
  reasoningEffort?: LlmReasoningEffort;
  textVerbosity?: LlmTextVerbosity;
  /**
   * Forces ("required") or forbids ("none") tool use on this route's
   * tool-carrying turn calls; every vendor adapter maps it. "required" means
   * "at least once" — the AgentRunner downgrades it to "auto" after the first
   * tool-bearing turn (see LlmToolChoice). The prompt paths carry no tools and
   * ignore it.
   */
  toolChoice?: LlmToolChoice;
}

export interface LlmServiceConfig extends LlmRouteConfig {
  /**
   * Ordered failover chain: walked when the route above it dies on a
   * fallback-worthy error (billing/quota, rate limit, outage, dead key) or
   * exhausts its attempts. Zero entries = no failover. Chain composition is a
   * per-service product/cost call, made in code — never an env override.
   */
  fallbacks?: LlmRouteConfig[];
  /**
   * Declares that this service's calls may carry provider-hosted tools
   * (file_search/web_search) — OpenAI-only. Boot validation rejects any
   * non-openai chain position; the service re-checks per call.
   */
  hostedTools?: boolean;
}

/**
 * The service registry: code, not database. Adding a consumer = one literal
 * added to LlmServiceName + one entry here; the Record over the union forces it.
 * Every provider a chain names needs its key in real mode — a second vendor in a
 * fallback is one more line here and one more key in `.env`.
 */
export const llmRegistry: Record<LlmServiceName, LlmServiceConfig> = {
  // One structured call per summary, no tools. The fallback keeps the summary
  // available when the primary model is rate-limited or down; a smaller model
  // on the same vendor needs no second key.
  "example-summary": {
    provider: "openai",
    model: "gpt-5.4-mini",
    maxOutputTokens: 2000,
    fallbacks: [{ provider: "openai", model: "gpt-5.4-nano", maxOutputTokens: 2000 }],
  },
  // The streaming turn: one reply per user message, text only. The reasoning
  // knobs keep a chat answer fast; they apply to gpt-5* models and nowhere else.
  "example-chat": {
    provider: "openai",
    model: "gpt-5.4-mini",
    maxOutputTokens: 4000,
    reasoningEffort: "low",
    textVerbosity: "low",
  },
};

export type LlmMode = "fake" | "real";
/**
 * Which engine backs AGENT_RUNNER: "native" is the product's own loop
 * (AgentRunnerService) and the default everywhere; "openai-agents" is the
 * opt-in to the OpenAI Agents SDK adapter.
 */
export type AgentRuntime = "native" | "openai-agents";
export const LLM_CONFIG = Symbol("LLM_CONFIG");

export interface LlmProviderCredentials {
  openai?: { apiKey: string };
  anthropic?: { apiKey: string; baseUrl?: string };
  google?: { apiKey: string };
  xai?: { apiKey: string; baseUrl?: string };
}

export interface LlmConfig {
  mode: LlmMode;
  agentRuntime?: AgentRuntime;
  registry: Record<LlmServiceName, LlmServiceConfig>;
  credentials: LlmProviderCredentials;
}

const KEY_ENV_BY_PROVIDER: Record<Exclude<LlmProviderName, "fake">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
};

/**
 * Hosted tools run vendor-side on OpenAI's Responses API; a chain that could
 * fail over to another provider would drop the service's retrieval mid-flight.
 * Chain composition is code, not env, so this fails the boot in every mode —
 * fake included.
 */
function assertHostedToolChains(registry: Record<LlmServiceName, LlmServiceConfig>): void {
  for (const [service, entry] of Object.entries(registry) as [LlmServiceName, LlmServiceConfig][]) {
    if (!entry.hostedTools) continue;
    for (const route of [entry, ...(entry.fallbacks ?? [])]) {
      if (route.provider !== "openai") {
        throw new LlmError(
          "configuration",
          `[llm] service "${service}" declares hostedTools but routes to ${route.provider}/${route.model}. ` +
            "Hosted tools are OpenAI-only — every chain position must be openai.",
          { service, provider: route.provider, model: route.model }
        );
      }
    }
  }
}

function resolveMode(env: Record<string, string | undefined>): LlmMode {
  const raw = env.LLM_MODE;
  if (raw === "fake" || raw === "real") return raw;
  if (raw !== undefined) {
    throw new Error(`[llm] LLM_MODE must be "fake" or "real", got "${raw}".`);
  }
  return "real";
}

function resolveAgentRuntime(env: Record<string, string | undefined>): AgentRuntime {
  const raw = env.AGENT_RUNTIME;
  if (raw === undefined || raw === "native") return "native";
  if (raw === "openai-agents") return raw;
  throw new Error(`[llm] AGENT_RUNTIME must be "native" or "openai-agents", got "${raw}".`);
}

/**
 * The only reader of `process.env` for this domain. The default is real in
 * every environment: a deploy that forgets the variable fails on its missing
 * key rather than silently answering from the fake; fake is an explicit
 * `LLM_MODE=fake` opt-in (tests, the REPL, and dev before an integration is
 * stable — `.env.example` ships it). Fail-fast is at startup, not first use:
 * in real mode every provider the registry references must have its key, so a
 * key error surfaces on deploy, not on the first user's message. Fake mode
 * skips all key checks and binds every service to the fake provider.
 */
export function loadLlmConfig(
  env: Record<string, string | undefined>,
  registry: Record<LlmServiceName, LlmServiceConfig> = llmRegistry
): LlmConfig {
  assertHostedToolChains(registry);
  const mode = resolveMode(env);
  const agentRuntime = resolveAgentRuntime(env);
  if (mode === "fake") return { mode, agentRuntime, registry, credentials: {} };

  // Every chain position counts: a fallback provider with no key would turn a
  // failover into a second failure, so it fails the boot exactly like a primary.
  const servicesByProvider = new Map<Exclude<LlmProviderName, "fake">, LlmServiceName[]>();
  for (const [service, entry] of Object.entries(registry) as [LlmServiceName, LlmServiceConfig][]) {
    for (const route of [entry, ...(entry.fallbacks ?? [])]) {
      const services = servicesByProvider.get(route.provider) ?? [];
      if (!services.includes(service)) servicesByProvider.set(route.provider, [...services, service]);
    }
  }

  const credentials: LlmProviderCredentials = {};
  for (const [provider, services] of servicesByProvider) {
    const envVar = KEY_ENV_BY_PROVIDER[provider];
    const apiKey = env[envVar];
    if (!apiKey) {
      throw new LlmError(
        "configuration",
        `[llm] ${envVar} is not set but the registry routes [${services.join(", ")}] to ${provider}. ` +
          "Set the key or run with LLM_MODE=fake.",
        { service: services[0], provider }
      );
    }
    if (provider === "openai") {
      credentials.openai = { apiKey };
    } else if (provider === "anthropic") {
      credentials.anthropic = { apiKey, ...(env.ANTHROPIC_BASE_URL && { baseUrl: env.ANTHROPIC_BASE_URL }) };
    } else if (provider === "google") {
      credentials.google = { apiKey };
    } else {
      credentials.xai = { apiKey, ...(env.XAI_BASE_URL && { baseUrl: env.XAI_BASE_URL }) };
    }
  }

  return { mode, agentRuntime, registry, credentials };
}
