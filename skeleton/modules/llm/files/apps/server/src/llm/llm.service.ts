import { randomUUID } from "node:crypto";
import {
  type StructuredOutputFailure,
  type StructuredValidation,
  buildRepairMessages,
  validateStructuredResponse,
} from "./json-output";
import { jsonSchemaOf, strictJsonSchemaOf } from "./json-schema";
import type { LlmConfig, LlmRouteConfig, LlmServiceConfig } from "./llm.config";
import type { LlmCallContext, LlmTelemetry } from "./llm.ports";
import {
  type LlmAttemptedRoute,
  type LlmClient,
  LlmError,
  type LlmProviderName,
  type LlmRequest,
  type LlmServiceName,
  type LlmStreamChunk,
  type LlmStreamRequest,
  type LlmStructuredRequest,
  type LlmTurnMessage,
  type LlmTurnRequest,
  type LlmTurnResult,
  isHostedTool,
} from "./llm.types";
import type {
  LlmProviderAdapter,
  ProviderCallSettings,
  ProviderErrorCategory,
  ProviderResult,
  ProviderTool,
} from "./providers/provider.types";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 1;
const CONTENT_PREVIEW_CHARS = 2000;

/**
 * The categories that mean "this provider is dead for now" — billing/quota,
 * rate limiting, outage, dead key. On these the service moves to the next
 * route in the chain immediately instead of burning same-provider retries.
 */
const FAILOVER_CATEGORIES: ReadonlySet<ProviderErrorCategory> = new Set([
  "billing_quota",
  "rate_limited",
  "unavailable",
  "auth",
]);

interface ResolvedRoute {
  adapter: LlmProviderAdapter;
  /** The registry-declared provider — in fake mode the adapter is the fake, but routing policy (hosted tools) reads this. */
  provider: Exclude<LlmProviderName, "fake">;
  model: string;
  maxOutputTokens: number;
  temperature?: number;
  reasoningEffort?: LlmRouteConfig["reasoningEffort"];
  textVerbosity?: LlmRouteConfig["textVerbosity"];
  toolChoice?: LlmRouteConfig["toolChoice"];
}

/** The request fields the attempt machinery reads — LlmRequest and LlmTurnRequest both satisfy it. */
interface CallRequest {
  service: LlmServiceName;
  referenceId?: string;
  signal?: AbortSignal;
}

interface SettingsExtras {
  tools?: ProviderTool[];
  /** The request-level override; the route's registry value applies when absent. */
  toolChoice?: LlmRouteConfig["toolChoice"];
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

type AttemptOutcome =
  | { kind: "ok"; result: ProviderResult; ctx: LlmCallContext }
  | { kind: "aborted"; ctx: LlmCallContext }
  | {
      kind: "failed";
      reason: "provider_error" | "empty_response";
      message: string;
      cause?: unknown;
      /** Adapter classification of a thrown vendor error; absent for response-shaped failures. */
      category?: ProviderErrorCategory;
      ctx: LlmCallContext;
    };

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError");
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function routesOf(resolved: ResolvedRoute[]): LlmAttemptedRoute[] {
  return resolved.map((route) => ({ provider: route.adapter.name, model: route.model }));
}

/**
 * The one home of retries, failover, structured-output validation/repair and
 * telemetry. Adapters stay dumb transport; consumers inject LLM_CLIENT and
 * never see a provider name.
 *
 * Failover policy: each service resolves to a chain (primary + registry
 * fallbacks). A fallback-worthy failure (FAILOVER_CATEGORIES) moves to the
 * next route immediately — no same-provider retries are burned on a dead
 * provider; any other failure keeps the same-provider attempt loop, and an
 * exhausted route also hands over to the next one. The last route always gets
 * the full attempt loop (a one-route chain is exactly the pre-failover
 * behavior). A chain with every route exhausted throws an LlmError whose
 * context lists every route tried.
 */
export class LlmService implements LlmClient {
  constructor(
    private readonly config: LlmConfig,
    private readonly adapters: Map<LlmProviderName, LlmProviderAdapter>,
    private readonly telemetry: LlmTelemetry
  ) {}

  async processPrompt(request: LlmRequest): Promise<string> {
    const routes = this.resolveChain(request);
    const requestId = randomUUID();
    let attempt = 0;
    let last: Extract<AttemptOutcome, { kind: "failed" }> | undefined;

    for (const [routeIndex, route] of routes.entries()) {
      const hasNextRoute = routeIndex < routes.length - 1;
      for (let routeAttempt = 1; routeAttempt <= DEFAULT_MAX_ATTEMPTS; routeAttempt++) {
        this.throwIfAborted(request, route);
        attempt += 1;
        const outcome = await this.attemptComplete(
          request,
          route,
          "prompt",
          this.settingsFor(route, request.messages, "text"),
          { requestId, attempt }
        );
        if (outcome.kind === "ok") return outcome.result.text;
        if (outcome.kind === "aborted") throw this.abortError(request.service, route);
        last = outcome;
        if (this.failsOver(outcome, hasNextRoute)) break;
      }
    }

    throw this.terminalError(request, routes, last, attempt);
  }

  async processTurn(request: LlmTurnRequest): Promise<LlmTurnResult> {
    const routes = this.resolveChain(request);
    this.assertHostedToolChain(request, routes);
    this.assertToolChoiceHasTools(request, routes);
    const tools = this.toProviderTools(request);
    const requestId = randomUUID();
    let attempt = 0;
    let last: Extract<AttemptOutcome, { kind: "failed" }> | undefined;

    for (const [routeIndex, route] of routes.entries()) {
      const hasNextRoute = routeIndex < routes.length - 1;
      for (let routeAttempt = 1; routeAttempt <= DEFAULT_MAX_ATTEMPTS; routeAttempt++) {
        this.throwIfAborted(request, route);
        attempt += 1;
        const outcome = await this.attemptComplete(
          request,
          route,
          "turn",
          this.settingsFor(route, request.messages, request.responseFormat ?? "text", {
            tools,
            ...(request.toolChoice !== undefined && { toolChoice: request.toolChoice }),
            ...(request.jsonSchema && { jsonSchema: request.jsonSchema }),
          }),
          { requestId, attempt }
        );
        if (outcome.kind === "ok") {
          const { result } = outcome;
          if (result.toolCalls && result.toolCalls.length > 0) {
            return {
              type: "tool_calls",
              toolCalls: result.toolCalls,
              text: result.text,
              usage: result.usage,
              model: route.model,
            };
          }
          return { type: "final", text: result.text, usage: result.usage, model: route.model };
        }
        if (outcome.kind === "aborted") throw this.abortError(request.service, route);
        last = outcome;
        if (this.failsOver(outcome, hasNextRoute)) break;
      }
    }

    throw this.terminalError(request, routes, last, attempt);
  }

  async processStructuredPrompt<T>(request: LlmStructuredRequest<T>): Promise<T> {
    const routes = this.resolveChain(request);
    const requestId = randomUUID();
    const maxRepairs = request.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
    // Native strict json_schema for adapters that support it (openai); null
    // when the schema does not qualify — the cleaning/validate/repair loop
    // below stays the contract either way, so other providers are unchanged.
    const strictSchema = strictJsonSchemaOf(request.schema);
    const extras: SettingsExtras | undefined = strictSchema
      ? { jsonSchema: { name: "structured_output", schema: strictSchema } }
      : undefined;
    let repairsUsed = 0;
    let attemptNumber = 0;
    let last: Extract<AttemptOutcome, { kind: "failed" }> | undefined;
    let lastInvalid: { ctx: LlmCallContext; failure: StructuredOutputFailure } | undefined;

    for (const [routeIndex, route] of routes.entries()) {
      const hasNextRoute = routeIndex < routes.length - 1;
      for (let routeAttempt = 1; routeAttempt <= DEFAULT_MAX_ATTEMPTS; routeAttempt++) {
        this.throwIfAborted(request, route);
        attemptNumber += 1;
        const outcome = await this.attemptComplete(
          request,
          route,
          "structured",
          this.settingsFor(route, request.messages, "json", extras),
          { requestId, attempt: attemptNumber }
        );
        if (outcome.kind === "aborted") throw this.abortError(request.service, route);
        if (outcome.kind === "failed") {
          last = outcome;
          if (this.failsOver(outcome, hasNextRoute)) break;
          continue;
        }

        const validation = validateStructuredResponse(outcome.result.text, request.schema);
        if (validation.ok) return validation.value;
        this.reportInvalid(outcome.ctx, validation);
        lastInvalid = { ctx: outcome.ctx, failure: validation.failure };

        if (repairsUsed >= maxRepairs) continue;
        this.throwIfAborted(request, route);
        repairsUsed += 1;
        attemptNumber += 1;
        // One single-attempt call — repair calls never trigger their own repair.
        const repairMessages = buildRepairMessages(request.messages, validation.cleaned, validation.failure);
        const repair = await this.attemptComplete(
          request,
          route,
          "structured",
          this.settingsFor(route, repairMessages, "json", extras),
          { requestId, attempt: attemptNumber }
        );
        if (repair.kind === "aborted") throw this.abortError(request.service, route);
        if (repair.kind === "failed") {
          // The validation failure stays the terminal cause; a dead provider
          // still hands over to the next route.
          if (this.failsOver(repair, hasNextRoute)) break;
          continue;
        }
        const repairValidation = validateStructuredResponse(repair.result.text, request.schema);
        if (repairValidation.ok) return repairValidation.value;
        this.reportInvalid(repair.ctx, repairValidation);
        lastInvalid = { ctx: repair.ctx, failure: repairValidation.failure };
      }
    }

    if (lastInvalid) {
      const error = new LlmError(
        "invalid_structured_output",
        `[llm] structured output still invalid (${lastInvalid.failure.kind}) after ${attemptNumber} call(s) including ${repairsUsed} repair(s)`,
        {
          service: request.service,
          provider: lastInvalid.ctx.provider,
          model: lastInvalid.ctx.model,
          attemptedRoutes: routesOf(routes),
        }
      );
      this.telemetry.errorCaptured(lastInvalid.ctx, error);
      throw error;
    }
    throw this.terminalError(request, routes, last, attemptNumber);
  }

  async *streamPrompt(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk> {
    const routes = this.resolveChain(request);
    const requestId = randomUUID();
    let lastFailure: { message: string; cause?: unknown; ctx: LlmCallContext } | undefined;

    // One attempt per route on purpose: the stream path has no same-provider
    // retry, so a failed attempt is by definition exhausted and hands over to
    // the next route — but only while NO delta has been yielded to the
    // consumer yet. Once the first delta is out, a failure throws: switching
    // providers would replay text.
    for (const [routeIndex, route] of routes.entries()) {
      const hasNextRoute = routeIndex < routes.length - 1;
      const ctx: LlmCallContext = {
        requestId,
        referenceId: request.referenceId ?? null,
        service: request.service,
        provider: route.adapter.name,
        model: route.model,
        mode: "stream",
        attempt: routeIndex + 1,
      };
      const tried = routesOf(routes.slice(0, routeIndex + 1));
      this.telemetry.callStarted(ctx);
      const startedAt = Date.now();
      let fullText = "";
      let deltaYielded = false;

      try {
        for await (const event of route.adapter.stream(
          this.settingsFor(route, request.messages, "text"),
          request.signal
        )) {
          if (event.type === "delta") {
            fullText += event.text;
            deltaYielded = true;
            yield { type: "delta", text: event.text };
            continue;
          }
          if (event.finishReason !== "stop") {
            const message = `[llm] ${ctx.provider}/${ctx.model} stream finished with reason "${event.finishReason}" (not "stop")`;
            this.endCall(ctx, startedAt, {
              status: "failure",
              usage: event.usage,
              finishReason: event.finishReason,
              contentLength: fullText.length,
              errorMessage: message,
            });
            const error = new LlmError("provider_error", message, {
              service: request.service,
              provider: route.adapter.name,
              model: route.model,
              attemptedRoutes: tried,
            });
            if (!deltaYielded && hasNextRoute) {
              lastFailure = { message, ctx };
              break; // next route — the for-await is done, the flag below skips the abort branch
            }
            this.telemetry.errorCaptured(ctx, error);
            throw error;
          }
          this.endCall(ctx, startedAt, {
            status: "success",
            usage: event.usage,
            finishReason: event.finishReason,
            contentLength: fullText.length,
            errorMessage: null,
          });
          yield { type: "done", fullText, usage: event.usage, model: route.model };
          return;
        }
        if (lastFailure?.ctx === ctx) continue; // failed over out of the for-await above
        // The adapter's iterator ended without a `done` event — the abort shape.
        // Client disconnect is a normal end, not an exception.
        this.endCall(ctx, startedAt, {
          status: "aborted",
          usage: null,
          finishReason: null,
          contentLength: fullText.length,
          errorMessage: null,
        });
        return;
      } catch (error) {
        if (error instanceof LlmError) throw error; // telemetry already emitted above
        if (request.signal?.aborted || isAbortError(error)) {
          this.endCall(ctx, startedAt, {
            status: "aborted",
            usage: null,
            finishReason: null,
            contentLength: fullText.length,
            errorMessage: null,
          });
          return;
        }
        const message = errorMessageOf(error);
        this.endCall(ctx, startedAt, {
          status: "failure",
          usage: null,
          finishReason: null,
          contentLength: fullText.length,
          errorMessage: message,
        });
        // Failover only while no delta has been yielded — see the loop comment.
        if (!deltaYielded && hasNextRoute) {
          lastFailure = { message, cause: error, ctx };
          continue;
        }
        const llmError = new LlmError(
          "provider_error",
          `[llm] ${ctx.provider}/${ctx.model} stream failed: ${message}`,
          { service: request.service, provider: route.adapter.name, model: route.model, attemptedRoutes: tried },
          { cause: error }
        );
        this.telemetry.errorCaptured(ctx, llmError);
        throw llmError;
      }
    }

    // Chain exhausted: every route failed before its first delta.
    const context = {
      service: request.service,
      ...(lastFailure && { provider: lastFailure.ctx.provider, model: lastFailure.ctx.model }),
      attemptedRoutes: routesOf(routes),
    };
    const error = lastFailure
      ? new LlmError(
          "provider_error",
          `[llm] stream failed on every route: ${lastFailure.message}`,
          context,
          lastFailure.cause !== undefined ? { cause: lastFailure.cause } : undefined
        )
      : new LlmError("provider_error", "[llm] stream produced no outcome on any route", context);
    if (lastFailure) this.telemetry.errorCaptured(lastFailure.ctx, error);
    throw error;
  }

  /**
   * The primary route with request overrides applied, then the registry
   * fallbacks verbatim: overrides shape the primary only — an override model
   * is meaningless on another provider's route.
   */
  private resolveChain(request: Pick<LlmRequest, "service" | "overrides">): ResolvedRoute[] {
    const entry = this.config.registry[request.service] as LlmServiceConfig | undefined;
    if (!entry) {
      throw new LlmError("configuration", `[llm] Unknown service "${request.service}" — no registry entry.`, {
        service: request.service,
      });
    }
    const primary = this.resolveRoute(request.service, {
      provider: entry.provider,
      model: request.overrides?.model ?? entry.model,
      maxOutputTokens: request.overrides?.maxOutputTokens ?? entry.maxOutputTokens,
      ...((request.overrides?.temperature ?? entry.temperature) !== undefined && {
        temperature: request.overrides?.temperature ?? entry.temperature,
      }),
      // The reasoning knobs are registry-only — they pair with the entry's model, so no override path.
      ...(entry.reasoningEffort !== undefined && { reasoningEffort: entry.reasoningEffort }),
      ...(entry.textVerbosity !== undefined && { textVerbosity: entry.textVerbosity }),
      // toolChoice's override rides LlmTurnRequest, not LlmCallOverrides — see settingsFor.
      ...(entry.toolChoice !== undefined && { toolChoice: entry.toolChoice }),
    });
    return [primary, ...(entry.fallbacks ?? []).map((fallback) => this.resolveRoute(request.service, fallback))];
  }

  private resolveRoute(service: LlmServiceName, route: LlmRouteConfig): ResolvedRoute {
    const adapter = this.adapters.get(route.provider);
    if (!adapter) {
      throw new LlmError("configuration", `[llm] No adapter wired for provider "${route.provider}".`, {
        service,
        provider: route.provider,
        model: route.model,
      });
    }
    return {
      adapter,
      provider: route.provider,
      model: route.model,
      maxOutputTokens: route.maxOutputTokens,
      ...(route.temperature !== undefined && { temperature: route.temperature }),
      ...(route.reasoningEffort !== undefined && { reasoningEffort: route.reasoningEffort }),
      ...(route.textVerbosity !== undefined && { textVerbosity: route.textVerbosity }),
      ...(route.toolChoice !== undefined && { toolChoice: route.toolChoice }),
    };
  }

  /**
   * Hosted tools run vendor-side on OpenAI's Responses API; any other provider
   * in the chain — primary or fallback — could end up serving the call without
   * the service's retrieval. Fail before the first attempt, naming the route.
   * The check reads the declared provider, so fake mode keeps working offline.
   */
  private assertHostedToolChain(request: LlmTurnRequest, routes: ResolvedRoute[]): void {
    if (!request.tools.some(isHostedTool)) return;
    const offending = routes.find((route) => route.provider !== "openai");
    if (!offending) return;
    throw new LlmError(
      "configuration",
      `[llm] service "${request.service}" call carries hosted tools (file_search/web_search), but its chain ` +
        `routes to ${offending.provider}/${offending.model}. Hosted tools are OpenAI-only — every chain ` +
        "position must be openai.",
      { service: request.service, provider: offending.provider, model: offending.model }
    );
  }

  /**
   * "required" promises the caller's tools get used; a turn carrying none could
   * never honor it, and the vendors reject the combination outright. Same
   * fail-fast seam as the hosted-tool guard: before the first attempt, naming
   * the route, any chain position counting — a failover would hit it too. The
   * prompt paths are untouched: they never carry tools, so a route-level
   * toolChoice simply does not apply to them.
   */
  private assertToolChoiceHasTools(request: LlmTurnRequest, routes: ResolvedRoute[]): void {
    if (request.tools.length > 0) return;
    const offending = routes.find((route) => (request.toolChoice ?? route.toolChoice) === "required");
    if (!offending) return;
    throw new LlmError(
      "configuration",
      `[llm] service "${request.service}" call has toolChoice "required" but carries no tools — ` +
        `route ${offending.provider}/${offending.model} could never satisfy it. Pass tools or drop the requirement.`,
      { service: request.service, provider: offending.provider, model: offending.model }
    );
  }

  /** Zod-to-JSON-Schema happens once here — adapters only ever see the plain derivation. */
  private toProviderTools(request: LlmTurnRequest): ProviderTool[] | undefined {
    if (request.tools.length === 0) return undefined;
    return request.tools.map((tool): ProviderTool => {
      if (isHostedTool(tool)) return tool;
      try {
        const strictSchema = strictJsonSchemaOf(tool.parameters);
        return {
          type: "function",
          name: tool.name,
          description: tool.description,
          parametersJsonSchema: strictSchema ?? jsonSchemaOf(tool.parameters),
          strict: strictSchema !== null,
        };
      } catch (error) {
        throw new LlmError(
          "configuration",
          `[llm] tool "${tool.name}" has a parameter schema Zod cannot represent as JSON Schema: ${errorMessageOf(error)}`,
          { service: request.service },
          { cause: error }
        );
      }
    });
  }

  private throwIfAborted(request: CallRequest, route: ResolvedRoute): void {
    if (request.signal?.aborted) throw this.abortError(request.service, route);
  }

  /** Abort is the caller's own doing: no retry, no failover, no errorCaptured — just the typed rejection. */
  private abortError(service: LlmServiceName, route: { provider: LlmProviderName; model: string }): LlmError {
    return new LlmError("aborted", "[llm] call aborted by the caller", {
      service,
      provider: route.provider,
      model: route.model,
    });
  }

  /** A dead provider hands over immediately — but only when a next route exists to hand over to. */
  private failsOver(outcome: Extract<AttemptOutcome, { kind: "failed" }>, hasNextRoute: boolean): boolean {
    return hasNextRoute && outcome.category !== undefined && FAILOVER_CATEGORIES.has(outcome.category);
  }

  private settingsFor(
    route: ResolvedRoute,
    messages: LlmTurnMessage[],
    responseFormat: "text" | "json",
    extras?: SettingsExtras
  ): ProviderCallSettings {
    const toolChoice = extras?.toolChoice ?? route.toolChoice;
    return {
      model: route.model,
      messages,
      maxOutputTokens: route.maxOutputTokens,
      ...(route.temperature !== undefined && { temperature: route.temperature }),
      ...(route.reasoningEffort !== undefined && { reasoningEffort: route.reasoningEffort }),
      ...(route.textVerbosity !== undefined && { textVerbosity: route.textVerbosity }),
      responseFormat,
      ...(extras?.jsonSchema && { jsonSchema: extras.jsonSchema }),
      ...(extras?.tools && { tools: extras.tools }),
      // Only alongside tools — the vendors reject a tool choice without them.
      ...(extras?.tools && toolChoice !== undefined && { toolChoice }),
    };
  }

  /** One provider call with its telemetry pair; failures are returned, not thrown. */
  private async attemptComplete(
    request: CallRequest,
    route: ResolvedRoute,
    mode: "prompt" | "structured" | "turn",
    settings: ProviderCallSettings,
    call: { requestId: string; attempt: number }
  ): Promise<AttemptOutcome> {
    const ctx: LlmCallContext = {
      requestId: call.requestId,
      referenceId: request.referenceId ?? null,
      service: request.service,
      provider: route.adapter.name,
      model: route.model,
      mode,
      attempt: call.attempt,
    };
    this.telemetry.callStarted(ctx);
    const startedAt = Date.now();
    try {
      const result = await route.adapter.complete(settings, request.signal);
      // A turn that stopped to call function tools is a success — the caller
      // gets the calls to execute; every other mode treats it as any other
      // non-"stop" finish below.
      if (mode === "turn" && result.finishReason === "tool_calls" && (result.toolCalls?.length ?? 0) > 0) {
        this.endCall(ctx, startedAt, {
          status: "success",
          usage: result.usage,
          finishReason: result.finishReason,
          contentLength: result.text.length,
          errorMessage: null,
        });
        return { kind: "ok", result, ctx };
      }
      // The service, not the adapter, decides what a finish reason means:
      // "stop" is success; anything else (e.g. "length") fails the attempt.
      if (result.finishReason !== "stop") {
        const message = `[llm] ${ctx.provider}/${ctx.model} finished with reason "${result.finishReason}" (not "stop")`;
        this.endCall(ctx, startedAt, {
          status: "failure",
          usage: result.usage,
          finishReason: result.finishReason,
          contentLength: result.text.length,
          errorMessage: message,
        });
        return { kind: "failed", reason: "provider_error", message, ctx };
      }
      if (!result.text) {
        const message = `[llm] ${ctx.provider}/${ctx.model} returned an empty response`;
        this.endCall(ctx, startedAt, {
          status: "failure",
          usage: result.usage,
          finishReason: result.finishReason,
          contentLength: 0,
          errorMessage: message,
        });
        return { kind: "failed", reason: "empty_response", message, ctx };
      }
      this.endCall(ctx, startedAt, {
        status: "success",
        usage: result.usage,
        finishReason: result.finishReason,
        contentLength: result.text.length,
        errorMessage: null,
      });
      return { kind: "ok", result, ctx };
    } catch (error) {
      // The caller aborted mid-flight: same "aborted" outcome the stream path
      // records — not a failure, never retried or failed over.
      if (request.signal?.aborted || isAbortError(error)) {
        this.endCall(ctx, startedAt, {
          status: "aborted",
          usage: null,
          finishReason: null,
          contentLength: null,
          errorMessage: null,
        });
        return { kind: "aborted", ctx };
      }
      const message = errorMessageOf(error);
      this.endCall(ctx, startedAt, {
        status: "failure",
        usage: null,
        finishReason: null,
        contentLength: null,
        errorMessage: message,
      });
      return {
        kind: "failed",
        reason: "provider_error",
        message,
        cause: error,
        category: route.adapter.classifyError(error),
        ctx,
      };
    }
  }

  private endCall(
    ctx: LlmCallContext,
    startedAt: number,
    outcome: {
      status: "success" | "failure" | "aborted";
      usage: ProviderResult["usage"] | null;
      finishReason: string | null;
      contentLength: number | null;
      errorMessage: string | null;
    }
  ): void {
    this.telemetry.callEnded(ctx, { ...outcome, durationMs: Date.now() - startedAt });
  }

  private reportInvalid<T>(ctx: LlmCallContext, validation: Extract<StructuredValidation<T>, { ok: false }>): void {
    this.telemetry.structuredOutputFailed(ctx, {
      kind: validation.failure.kind,
      detail: validation.failure.detail,
      contentPreview: validation.cleaned.slice(0, CONTENT_PREVIEW_CHARS),
    });
  }

  private terminalError(
    request: CallRequest,
    routes: ResolvedRoute[],
    last: Extract<AttemptOutcome, { kind: "failed" }> | undefined,
    attempts: number
  ): LlmError {
    const context = {
      service: request.service,
      ...(last && { provider: last.ctx.provider, model: last.ctx.model }),
      attemptedRoutes: routesOf(routes),
    };
    const error = last
      ? new LlmError(
          last.reason,
          `${last.message} after ${attempts} attempt(s) across ${routes.length} route(s)`,
          context,
          last.cause !== undefined ? { cause: last.cause } : undefined
        )
      : new LlmError("provider_error", `[llm] no attempt produced an outcome after ${attempts} attempt(s)`, context);
    if (last) this.telemetry.errorCaptured(last.ctx, error);
    return error;
  }
}
