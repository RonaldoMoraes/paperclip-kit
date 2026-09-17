/**
 * The one sanctioned AgentRunner-port exception. The product's own loop
 * (AgentRunnerService, AGENT_RUNTIME "native") stays the default engine
 * everywhere; this adapter exists only behind the explicit
 * AGENT_RUNTIME=openai-agents opt-in. It is the ONLY file that may import
 * @openai/agents (openai-agents-imports.grit enforces it) — everything it
 * accepts and returns crosses the port as plain product types. SDK tracing
 * stays on with sensitive data excluded: a run already goes to OpenAI, so a
 * trace of it is no new disclosure, and a dev-only gate here would hide the
 * shape of what ships.
 */
import { randomUUID } from "node:crypto";
import type { Model, ModelProvider, ModelRequest, ModelResponse, Tool } from "@openai/agents";
import {
  Agent,
  MaxTurnsExceededError,
  Runner,
  fileSearchTool,
  getGlobalTraceProvider,
  getOrCreateTrace,
  tool,
  webSearchTool,
} from "@openai/agents";
import type {
  AgentDefinition,
  AgentFunctionTool,
  AgentRunEvent,
  AgentRunOptions,
  AgentRunResult,
  AgentRunner,
  AgentTool,
  NestedAgentDefinition,
} from "../agents/agent.types";
import type { LlmConfig, LlmRouteConfig } from "../llm.config";
import type { LlmCallContext, LlmTelemetry } from "../llm.ports";
import type { LlmHostedTool, LlmUsage } from "../llm.types";
import { LlmError } from "../llm.types";

/** The SDK surface the conformance suite scripts against — re-exported so no spec ever imports @openai/agents itself. */
export type { Model, ModelProvider, ModelRequest, ModelResponse };

const DEFAULT_MAX_TURNS = 10;
export async function flushOpenAiAgentTraces(): Promise<void> {
  await getGlobalTraceProvider().forceFlush();
}

export function withOpenAiAgentTrace<T>(name: string, referenceId: string, callback: () => Promise<T>): Promise<T> {
  return getOrCreateTrace(callback, { name, groupId: referenceId });
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inputFromHistory(history: AgentRunResult["history"]): string {
  return history
    .map((message) => {
      if (message.role === "tool") return `Tool ${message.toolName}: ${message.content}`;
      if (message.role === "assistant" && "toolCalls" in message) {
        return `${message.content}\n${message.toolCalls.map((call) => `Called ${call.name}(${call.argumentsJson})`).join("\n")}`;
      }
      return message.content;
    })
    .filter(Boolean)
    .join("\n\n");
}

function hostedTool(toolDefinition: LlmHostedTool) {
  if (toolDefinition.type === "file_search") {
    return fileSearchTool(toolDefinition.vectorStoreIds, {
      ...(toolDefinition.maxNumResults !== undefined && { maxNumResults: toolDefinition.maxNumResults }),
    });
  }
  return webSearchTool({
    ...(toolDefinition.searchContextSize !== undefined && { searchContextSize: toolDefinition.searchContextSize }),
  });
}

function functionTool(toolDefinition: AgentFunctionTool) {
  return tool({
    name: toolDefinition.name,
    description: toolDefinition.description,
    parameters: toolDefinition.parameters,
    execute: async (args: unknown) => {
      try {
        return await toolDefinition.execute(args);
      } catch (error) {
        return `Tool "${toolDefinition.name}" failed: ${errorMessageOf(error)}`;
      }
    },
  });
}

function sdkTools(tools: AgentTool[], serviceModel?: string): Tool[] {
  return tools.map((toolDefinition) => {
    if (toolDefinition.type === "function") return functionTool(toolDefinition);
    if (toolDefinition.type === "agent")
      return sdkAgent(toolDefinition.agent, serviceModel ? { model: serviceModel } : undefined).asTool({
        toolName: toolDefinition.toolName,
        toolDescription: toolDefinition.toolDescription,
      });
    return hostedTool(toolDefinition);
  });
}

function sdkAgent<TOutput>(
  definition: NestedAgentDefinition<TOutput>,
  route?: Partial<
    Pick<LlmRouteConfig, "model" | "maxOutputTokens" | "reasoningEffort" | "textVerbosity" | "toolChoice">
  >
) {
  return new Agent({
    name: definition.name,
    instructions: definition.instructions,
    ...(route?.model !== undefined && { model: route.model }),
    modelSettings: {
      ...(route?.maxOutputTokens !== undefined && { maxTokens: route.maxOutputTokens }),
      ...(route?.toolChoice !== undefined && { toolChoice: route.toolChoice }),
      ...(route?.reasoningEffort !== undefined && { reasoning: { effort: route.reasoningEffort } }),
      ...(route?.textVerbosity !== undefined && { verbosity: route.textVerbosity }),
    },
    tools: sdkTools(definition.tools ?? [], route?.model),
    ...(definition.outputType !== undefined && { outputType: definition.outputType }),
  });
}

function finalTextOf(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output);
}

export class OpenAiAgentsService implements AgentRunner {
  private readonly runner: Runner;

  constructor(
    private readonly config: Pick<LlmConfig, "registry">,
    private readonly telemetry: LlmTelemetry,
    /** Test seam: the conformance suite injects a scripted ModelProvider to drive the SDK loop offline. */
    modelProvider?: ModelProvider
  ) {
    this.runner = new Runner({
      tracingDisabled: false,
      traceIncludeSensitiveData: false,
      ...(modelProvider && { modelProvider }),
    });
  }

  async run<TOutput = string>(
    definition: AgentDefinition<TOutput>,
    history: AgentRunResult["history"],
    options: AgentRunOptions = {}
  ): Promise<AgentRunResult<TOutput>> {
    if (options.signal?.aborted) {
      throw new LlmError("aborted", "[llm] agent run aborted by the caller", { service: definition.service });
    }

    const route = this.config.registry[definition.service];
    if (route?.provider !== "openai") {
      throw new LlmError(
        "configuration",
        `[llm] OpenAI Agents SDK requires an openai route for "${definition.service}".`,
        {
          service: definition.service,
          provider: route?.provider,
          model: route?.model,
        }
      );
    }

    const maxTurns = definition.maxTurns ?? DEFAULT_MAX_TURNS;
    const agent = sdkAgent(definition, route);
    // The port promises runs report through LLM_TELEMETRY. The SDK owns the
    // inner loop, so one callStarted/callEnded pair brackets the whole run —
    // per-model-call granularity (the native runner's) is not reachable here.
    const ctx: LlmCallContext = {
      requestId: randomUUID(),
      referenceId: options.referenceId ?? null,
      service: definition.service,
      provider: "openai",
      model: route.model,
      mode: "turn",
      attempt: 1,
    };
    this.telemetry.callStarted(ctx);
    const startedAt = Date.now();
    try {
      const runAgent = () =>
        this.runner.run(agent, inputFromHistory(history), {
          maxTurns,
          signal: options.signal,
        });
      const result = options.referenceId
        ? await withOpenAiAgentTrace(definition.name, options.referenceId, runAgent)
        : await runAgent();
      const output = result.finalOutput as TOutput;
      const finalText = finalTextOf(output);
      const usage: LlmUsage = {
        inputTokens: result.state.usage.inputTokens ?? null,
        outputTokens: result.state.usage.outputTokens ?? null,
      };
      this.telemetry.callEnded(ctx, {
        status: "success",
        durationMs: Date.now() - startedAt,
        usage,
        finishReason: null,
        contentLength: finalText.length,
        errorMessage: null,
      });
      return {
        output,
        finalText,
        history: [...history, { role: "assistant", content: finalText }],
        usage,
        turns: result.state._currentTurn,
      };
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        // Abort is the caller's own doing: recorded, never captured as an error.
        this.endWith(ctx, startedAt, "aborted", null);
        throw new LlmError("aborted", "[llm] agent run aborted by the caller", { service: definition.service });
      }
      if (error instanceof MaxTurnsExceededError) {
        // The port's turn bound: same code and message shape as the native runner.
        this.endWith(ctx, startedAt, "failure", error.message);
        throw new LlmError(
          "max_turns_exceeded",
          `[llm] agent "${definition.name}" used ${maxTurns} turn(s) without reaching a final answer`,
          { service: definition.service },
          { cause: error }
        );
      }
      const message = errorMessageOf(error);
      this.endWith(ctx, startedAt, "failure", message);
      const llmError = new LlmError(
        "provider_error",
        `[llm] OpenAI Agents SDK run failed: ${message}`,
        {
          service: definition.service,
          provider: "openai",
          model: route.model,
        },
        { cause: error }
      );
      this.telemetry.errorCaptured(ctx, llmError);
      throw llmError;
    }
  }

  private endWith(ctx: LlmCallContext, startedAt: number, status: "aborted" | "failure", errorMessage: string | null) {
    this.telemetry.callEnded(ctx, {
      status,
      durationMs: Date.now() - startedAt,
      usage: null,
      finishReason: null,
      contentLength: null,
      errorMessage,
    });
  }

  async *runStream(
    definition: AgentDefinition<unknown>,
    history: AgentRunResult["history"],
    options: AgentRunOptions = {}
  ): AsyncIterable<AgentRunEvent> {
    yield { type: "run_started", agent: definition.name };
    yield { type: "turn_started", agent: definition.name, turn: 1 };
    try {
      const result = await this.run(definition, history, options);
      yield {
        type: "turn_completed",
        agent: definition.name,
        turn: result.turns,
        outcome: "final",
        usage: result.usage,
        model: this.config.registry[definition.service].model,
      };
      yield { type: "final_delta", agent: definition.name, text: result.finalText };
      yield { type: "run_completed", agent: definition.name, result };
    } catch (error) {
      if (error instanceof LlmError && error.code === "aborted") return;
      throw error;
    }
  }
}
