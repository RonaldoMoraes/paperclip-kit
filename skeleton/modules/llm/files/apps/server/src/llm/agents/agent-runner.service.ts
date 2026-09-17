import { type ZodType, z } from "zod";
import { buildRepairMessages, validateStructuredResponse } from "../json-output";
import { strictJsonSchemaOf } from "../json-schema";
import {
  type LlmClient,
  LlmError,
  type LlmServiceName,
  type LlmTool,
  type LlmToolCall,
  type LlmTurnMessage,
  type LlmUsage,
} from "../llm.types";
import type {
  AgentAsTool,
  AgentDefinition,
  AgentFunctionTool,
  AgentRunEvent,
  AgentRunOptions,
  AgentRunResult,
  AgentRunner,
  AgentTool,
  NestedAgentDefinition,
} from "./agent.types";

const DEFAULT_MAX_TURNS = 10;
const FINAL_OUTPUT_SCHEMA_NAME = "final_output";

/** The single-argument contract every nested agent is exposed through. */
const NESTED_INPUT_SCHEMA = z.object({ input: z.string() });

const NO_USAGE: LlmUsage = { inputTokens: null, outputTokens: null };

interface ToolOutcome {
  content: string;
  isError: boolean;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Null-preserving sum: a component stays null only while no step has reported it. */
function addUsage(total: LlmUsage, step: LlmUsage): LlmUsage {
  return {
    inputTokens: step.inputTokens === null ? total.inputTokens : (total.inputTokens ?? 0) + step.inputTokens,
    outputTokens: step.outputTokens === null ? total.outputTokens : (total.outputTokens ?? 0) + step.outputTokens,
  };
}

type ParsedArguments<T> = { ok: true; value: T } | { ok: false; message: string };

/** JSON-parse and Zod-validate one call's arguments; failures become model-readable messages, never throws. */
function parseToolArguments<T>(call: LlmToolCall, schema: ZodType<T>): ParsedArguments<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.argumentsJson);
  } catch (error) {
    return { ok: false, message: `Tool "${call.name}" arguments are not valid JSON: ${errorMessageOf(error)}` };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      message: `Tool "${call.name}" arguments failed validation: ${JSON.stringify(result.error.issues)}`,
    };
  }
  return { ok: true, value: result.data };
}

/** What each agent tool looks like on the wire: nested agents ride as function tools taking `{ input }`. */
function toTurnTool(tool: AgentTool): LlmTool {
  if (tool.type === "agent") {
    return {
      type: "function",
      name: tool.toolName,
      description: tool.toolDescription,
      parameters: NESTED_INPUT_SCHEMA,
    };
  }
  if (tool.type === "function") {
    return { type: "function", name: tool.name, description: tool.description, parameters: tool.parameters };
  }
  return tool; // hosted descriptors pass through; they run vendor-side and never dispatch here
}

/**
 * The agent loop on LlmClient primitives: call the model → dispatch the tool
 * calls it wants (function tools locally, nested agents as nested runs) →
 * append the results → repeat until a final answer or maxTurns. A tool failure
 * — unknown name, bad arguments, a throwing executor, a failed nested run —
 * becomes an isError tool result the model sees on its next turn; the loop
 * never crashes on one. Every model call goes through processTurn, so
 * telemetry, retries, failover, fake mode and abort hold per step for free.
 */
export class AgentRunnerService implements AgentRunner {
  constructor(private readonly llm: LlmClient) {}

  async run<TOutput = string>(
    agent: AgentDefinition<TOutput>,
    history: LlmTurnMessage[],
    options: AgentRunOptions = {}
  ): Promise<AgentRunResult<TOutput>> {
    const loop = this.executeLoop<TOutput>(agent, agent.service, history, options);
    let step = await loop.next();
    while (!step.done) step = await loop.next();
    return step.value;
  }

  async *runStream(
    agent: AgentDefinition<unknown>,
    history: LlmTurnMessage[],
    options: AgentRunOptions = {}
  ): AsyncIterable<AgentRunEvent> {
    yield { type: "run_started", agent: agent.name };
    try {
      const result = yield* this.executeLoop(agent, agent.service, history, options);
      yield { type: "final_delta", agent: agent.name, text: result.finalText };
      yield { type: "run_completed", agent: agent.name, result };
    } catch (error) {
      // The layer's stream abort contract: the caller aborted, so the iterator
      // ends quietly — client disconnect is not an exception.
      if (error instanceof LlmError && error.code === "aborted") return;
      throw error;
    }
  }

  /**
   * One agent's loop, shared by run (drained) and runStream (forwarded) and
   * reentered for nested runs. Yields progress events; returns the result.
   */
  private async *executeLoop<TOutput>(
    agent: NestedAgentDefinition<TOutput>,
    service: LlmServiceName,
    initialHistory: LlmTurnMessage[],
    options: AgentRunOptions
  ): AsyncGenerator<AgentRunEvent, AgentRunResult<TOutput>> {
    const tools = agent.tools ?? [];
    const dispatchable = buildDispatchMap(agent.name, tools, service);
    const turnTools = tools.map(toTurnTool);
    const maxTurns = agent.maxTurns ?? DEFAULT_MAX_TURNS;
    const outputType = agent.outputType;
    // Structured runs steer every turn to JSON (native strict json_schema when
    // the schema qualifies): the model knows the output contract from turn one,
    // and tool calling is unaffected.
    const strictSchema = outputType ? strictJsonSchemaOf(outputType) : null;
    const history = [...initialHistory];
    let usage = NO_USAGE;
    // The route may declare toolChoice "required"; left standing it would force
    // tool calls on every turn and the loop could never reach a final answer.
    // After the first tool-bearing turn the loop pins "auto" — "required" means
    // "use a tool at least once" — the reset-after-use behavior the OpenAI Agents
    // SDK has. The flag is loop-local, so every nested run gets its own.
    let hadToolCalls = false;

    for (let turn = 1; turn <= maxTurns; turn++) {
      yield { type: "turn_started", agent: agent.name, turn };
      const result = await this.llm.processTurn({
        service,
        messages: [{ role: "system", content: agent.instructions }, ...history],
        tools: turnTools,
        ...(hadToolCalls && { toolChoice: "auto" as const }),
        ...(options.referenceId !== undefined && { referenceId: options.referenceId }),
        ...(options.signal && { signal: options.signal }),
        ...(outputType && {
          responseFormat: "json" as const,
          ...(strictSchema && { jsonSchema: { name: FINAL_OUTPUT_SCHEMA_NAME, schema: strictSchema } }),
        }),
      });
      usage = addUsage(usage, result.usage);
      yield {
        type: "turn_completed",
        agent: agent.name,
        turn,
        outcome: result.type,
        usage: result.usage,
        model: result.model,
      };

      if (result.type === "final") {
        const final = outputType
          ? await this.finalizeStructured(service, agent.instructions, history, result.text, outputType, options)
          : // No outputType means TOutput is the default string — the final text.
            { output: result.text as TOutput, finalText: result.text };
        history.push({ role: "assistant", content: final.finalText });
        return { output: final.output, finalText: final.finalText, history, usage, turns: turn };
      }

      hadToolCalls = true;
      history.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        this.throwIfAborted(options, service);
        yield { type: "tool_call_started", agent: agent.name, turn, toolCallId: call.id, toolName: call.name };
        const tool = dispatchable.get(call.name);
        let outcome: ToolOutcome;
        if (!tool) {
          const known = [...dispatchable.keys()].join(", ") || "none";
          outcome = { content: `Unknown tool "${call.name}". Available tools: ${known}.`, isError: true };
        } else if (tool.type === "agent") {
          const nested = yield* this.runNested(tool, agent.name, call, service, options);
          usage = addUsage(usage, nested.usage);
          outcome = nested;
        } else {
          outcome = await executeFunctionTool(tool, call);
        }
        history.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: outcome.content,
          ...(outcome.isError && { isError: true }),
        });
        yield {
          type: "tool_call_completed",
          agent: agent.name,
          turn,
          toolCallId: call.id,
          toolName: call.name,
          isError: outcome.isError,
        };
      }
    }

    throw new LlmError(
      "max_turns_exceeded",
      `[llm] agent "${agent.name}" used ${maxTurns} turn(s) without reaching a final answer`,
      { service }
    );
  }

  /**
   * A nested run behind a tool call: the model's `input` becomes the nested
   * user message; the nested final text becomes the tool result. Inner
   * progress events forward to the consumer (attributed by agent name); a
   * failed nested run feeds back as an isError result like any other tool —
   * only abort propagates.
   */
  private async *runNested(
    tool: AgentAsTool,
    parentName: string,
    call: LlmToolCall,
    parentService: LlmServiceName,
    options: AgentRunOptions
  ): AsyncGenerator<AgentRunEvent, ToolOutcome & { usage: LlmUsage }> {
    const args = parseToolArguments(call, NESTED_INPUT_SCHEMA);
    if (!args.ok) return { content: args.message, isError: true, usage: NO_USAGE };
    const nested = tool.agent;
    yield { type: "nested_run_started", agent: nested.name, parent: parentName, toolCallId: call.id };
    try {
      const result = yield* this.executeLoop(
        nested,
        nested.service ?? parentService,
        [{ role: "user", content: args.value.input }],
        options
      );
      yield {
        type: "nested_run_completed",
        agent: nested.name,
        parent: parentName,
        toolCallId: call.id,
        usage: result.usage,
        isError: false,
      };
      return { content: result.finalText, isError: false, usage: result.usage };
    } catch (error) {
      if (error instanceof LlmError && error.code === "aborted") throw error;
      yield {
        type: "nested_run_completed",
        agent: nested.name,
        parent: parentName,
        toolCallId: call.id,
        usage: NO_USAGE,
        isError: true,
      };
      return { content: `Tool "${call.name}" failed: ${errorMessageOf(error)}`, isError: true, usage: NO_USAGE };
    }
  }

  /**
   * The structured final: validate the text against outputType; on failure,
   * one bounded repair through the layer's own machinery. maxRepairAttempts is
   * 0 because this call IS the repair — the layer's rule that repair calls
   * never trigger their own repair holds across the seam; its normal attempt
   * loop (and invalid_structured_output on exhaustion) still applies.
   */
  private async finalizeStructured<TOutput>(
    service: LlmServiceName,
    instructions: string,
    history: LlmTurnMessage[],
    text: string,
    schema: ZodType<TOutput>,
    options: AgentRunOptions
  ): Promise<{ output: TOutput; finalText: string }> {
    const validation = validateStructuredResponse(text, schema);
    if (validation.ok) return { output: validation.value, finalText: validation.cleaned };
    const output = await this.llm.processStructuredPrompt({
      service,
      messages: buildRepairMessages(
        [{ role: "system", content: instructions }, ...history],
        validation.cleaned,
        validation.failure
      ),
      schema,
      maxRepairAttempts: 0,
      ...(options.referenceId !== undefined && { referenceId: options.referenceId }),
      ...(options.signal && { signal: options.signal }),
    });
    return { output, finalText: JSON.stringify(output) };
  }

  /** Same rejection shape as the client's non-stream paths; runStream turns it into a quiet end. */
  private throwIfAborted(options: AgentRunOptions, service: LlmServiceName): void {
    if (options.signal?.aborted) {
      throw new LlmError("aborted", "[llm] agent run aborted by the caller", { service });
    }
  }
}

async function executeFunctionTool(tool: AgentFunctionTool, call: LlmToolCall): Promise<ToolOutcome> {
  const args = parseToolArguments(call, tool.parameters);
  if (!args.ok) return { content: args.message, isError: true };
  try {
    return { content: await tool.execute(args.value), isError: false };
  } catch (error) {
    return { content: `Tool "${call.name}" failed: ${errorMessageOf(error)}`, isError: true };
  }
}

/**
 * Dispatch is by the name the model calls; two tools sharing one would
 * silently shadow each other, so a collision fails the run before any model
 * call. Hosted tools never dispatch here and stay out of the map.
 */
function buildDispatchMap(
  agentName: string,
  tools: AgentTool[],
  service: LlmServiceName
): Map<string, AgentFunctionTool | AgentAsTool> {
  const dispatchable = new Map<string, AgentFunctionTool | AgentAsTool>();
  for (const tool of tools) {
    if (tool.type !== "function" && tool.type !== "agent") continue;
    const name = tool.type === "agent" ? tool.toolName : tool.name;
    if (dispatchable.has(name)) {
      throw new LlmError("configuration", `[llm] agent "${agentName}" declares two tools named "${name}".`, {
        service,
      });
    }
    dispatchable.set(name, tool);
  }
  return dispatchable;
}
