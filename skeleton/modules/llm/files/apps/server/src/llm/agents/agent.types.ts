import type { ZodType } from "zod";
import type { LlmHostedTool, LlmServiceName, LlmTurnMessage, LlmUsage } from "../llm.types";

/**
 * A product-defined tool the agent loop executes. Zod is the single
 * parameter-schema source: the loop validates the model's arguments against
 * `parameters` before `execute` ever runs.
 */
export interface AgentFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: ZodType;
  /**
   * Runs with arguments already validated against `parameters`. A rejection
   * becomes an isError tool result fed back to the model — never a crash.
   */
  execute: (args: unknown) => Promise<string>;
}

/** Builds an AgentFunctionTool whose executor sees its Zod-inferred argument type. */
export function agentFunctionTool<TArgs>(tool: {
  name: string;
  description: string;
  parameters: ZodType<TArgs>;
  execute: (args: TArgs) => Promise<string>;
}): AgentFunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    // The loop validates against `parameters` before dispatching — the cast
    // only restates what safeParse already proved.
    execute: (args) => tool.execute(args as TArgs),
  };
}

/**
 * A nested agent exposed to its parent as a function tool taking
 * `{ input: string }`: executed as a nested run whose final text becomes the
 * tool result.
 */
export interface AgentAsTool {
  type: "agent";
  toolName: string;
  toolDescription: string;
  agent: NestedAgentDefinition;
}

/** Function tools run in the loop, nested agents as nested runs; hosted tools pass through to the vendor. */
export type AgentTool = AgentFunctionTool | AgentAsTool | LlmHostedTool;

/**
 * One agent: instructions over a registry route, with tools and an optional
 * structured-output contract. Names, instructions, routes and bounds are plain
 * data; the tool bindings and Zod schemas are code — definitions are
 * code-owned (a store persists run *history*, never definitions).
 */
export interface AgentDefinition<TOutput = string> {
  name: string;
  /** The system prompt; prepended to the history on every turn, never stored in it. */
  instructions: string;
  /** The registry route every turn of this agent runs on. */
  service: LlmServiceName;
  tools?: AgentTool[];
  /**
   * Structured final output. The final answer is steered to JSON (native
   * strict json_schema when the schema qualifies) and validated through the
   * layer's validate/repair machinery; the run then resolves to the parsed
   * value instead of text.
   */
  outputType?: ZodType<TOutput>;
  /** Model turns before the run fails with LlmError("max_turns_exceeded"). Default 10. */
  maxTurns?: number;
}

/** A nested agent may omit `service` — it then runs on its parent's route. */
export type NestedAgentDefinition<TOutput = unknown> = Omit<AgentDefinition<TOutput>, "service"> & {
  service?: LlmServiceName;
};

export interface AgentRunOptions {
  /**
   * Threads through every model turn, tool dispatch and nested run. `run`
   * rejects with LlmError("aborted"); `runStream` ends quietly without a
   * `run_completed` event — the layer's stream abort contract.
   */
  signal?: AbortSignal;
  /** Caller correlation id, forwarded to telemetry on every loop step — one id groups a whole run. */
  referenceId?: string;
}

export interface AgentRunResult<TOutput = string> {
  /** The final text — or the parsed, Zod-validated value when the agent declares outputType. */
  output: TOutput;
  /**
   * The canonical final answer text, exactly the last assistant message
   * appended to history; for structured runs the cleaned (or repaired) JSON.
   */
  finalText: string;
  /** The caller's history plus everything the run appended. The input array is never mutated. */
  history: LlmTurnMessage[];
  /** Aggregated across every model turn of the run, nested runs included; null when no step reported it. */
  usage: LlmUsage;
  /** Model turns this loop used. Nested runs count against their own maxTurns, not this. */
  turns: number;
}

/**
 * The streaming run vocabulary, designed for an SSE endpoint. Events
 * carry the emitting agent's name, so nested-run progress interleaves with the
 * root's and stays attributable.
 *
 * Constraint: every turn runs through processTurn — whether a turn is final is
 * known only after it completes, and the provider stream path carries no
 * tool-call events — so today a single `final_delta` carries the whole final
 * text. The shape is delta-based on purpose: a consumer written against it
 * survives real token streaming later without a contract change.
 */
export type AgentRunEvent =
  | { type: "run_started"; agent: string }
  | { type: "turn_started"; agent: string; turn: number }
  | {
      type: "turn_completed";
      agent: string;
      turn: number;
      outcome: "final" | "tool_calls";
      usage: LlmUsage;
      model: string;
    }
  | { type: "tool_call_started"; agent: string; turn: number; toolCallId: string; toolName: string }
  | { type: "tool_call_completed"; agent: string; turn: number; toolCallId: string; toolName: string; isError: boolean }
  | { type: "nested_run_started"; agent: string; parent: string; toolCallId: string }
  | {
      type: "nested_run_completed";
      agent: string;
      parent: string;
      toolCallId: string;
      usage: LlmUsage;
      isError: boolean;
    }
  | { type: "final_delta"; agent: string; text: string }
  | { type: "run_completed"; agent: string; result: AgentRunResult<unknown> };

/**
 * The agent-loop port. Same consumption pattern as LLM_CLIENT:
 * `constructor(@Inject(AGENT_RUNNER) private readonly agents: AgentRunner) {}`.
 */
export interface AgentRunner {
  /**
   * Runs the loop to completion: model turn → dispatch tool calls (function
   * tools locally, nested agents as nested runs, failures fed back as isError
   * results) → repeat, until a final answer or maxTurns. History is
   * caller-owned and serializable — hand back `result.history` to continue the
   * conversation.
   */
  run<TOutput = string>(
    agent: AgentDefinition<TOutput>,
    history: LlmTurnMessage[],
    options?: AgentRunOptions
  ): Promise<AgentRunResult<TOutput>>;
  /**
   * The same loop yielding progress events, ending in `run_completed`.
   * Errors throw from the iterator; abort ends it quietly (no `run_completed`).
   */
  runStream(
    agent: AgentDefinition<unknown>,
    history: LlmTurnMessage[],
    options?: AgentRunOptions
  ): AsyncIterable<AgentRunEvent>;
}

export const AGENT_RUNNER = Symbol("AGENT_RUNNER");
