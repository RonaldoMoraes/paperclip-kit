import type { Telemetry } from "../common/ports/telemetry";
import type { LlmProviderName, LlmServiceName, LlmUsage } from "./llm.types";

export interface LlmCallContext {
  requestId: string; // minted per client call
  referenceId: string | null; // caller-supplied correlation id
  service: LlmServiceName;
  provider: LlmProviderName;
  model: string;
  mode: "prompt" | "structured" | "stream" | "turn";
  attempt: number; // 1-based; repair calls keep counting up
}

export interface LlmCallOutcome {
  status: "success" | "failure" | "aborted";
  durationMs: number;
  usage: LlmUsage | null;
  finishReason: string | null;
  contentLength: number | null;
  errorMessage: string | null;
}

/**
 * The LLM domain's one observability seam. The domain emits events here and moves
 * on; `LlmModule` binds it to the app's telemetry port through `llmTelemetryOver`.
 *
 * Contract: methods are synchronous, fire-and-forget, and must never throw or
 * block — an implementation that needs I/O queues internally. The LLM domain
 * never awaits telemetry.
 */
export interface LlmTelemetry {
  callStarted(ctx: LlmCallContext): void;
  callEnded(ctx: LlmCallContext, outcome: LlmCallOutcome): void;
  structuredOutputFailed(
    ctx: LlmCallContext,
    failure: {
      kind: "invalid-json" | "schema-mismatch" | "empty-json" | "empty-response";
      detail: string; // parse error message or stringified Zod issues
      contentPreview: string; // first 2000 chars of the invalid output
    }
  ): void;
  errorCaptured(ctx: LlmCallContext, error: unknown): void;
}

export const LLM_TELEMETRY = Symbol("LLM_TELEMETRY");

/** Null object for tests and scripts. */
export const noopLlmTelemetry: LlmTelemetry = {
  callStarted() {},
  callEnded() {},
  structuredOutputFailed() {},
  errorCaptured() {},
};

/**
 * The adapter over the app's telemetry port (`common/ports/telemetry.ts`): a call
 * becomes two operational events, a structured-output failure a warning, a terminal
 * failure a captured error. The invalid output itself (`contentPreview`) never crosses
 * this seam — it may hold what a user wrote, and the port's sink may be a third party.
 * A sink that needs it wraps `LlmTelemetry` directly.
 */
export function llmTelemetryOver(telemetry: Telemetry): LlmTelemetry {
  return {
    callStarted(ctx) {
      telemetry.event("llm.call.started", { ...ctx });
    },
    callEnded(ctx, outcome) {
      const { usage, ...rest } = outcome;
      telemetry.event("llm.call.ended", {
        ...ctx,
        ...rest,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      });
    },
    structuredOutputFailed(ctx, failure) {
      telemetry.log("warn", "[llm] structured output failed validation", {
        ...ctx,
        kind: failure.kind,
        detail: failure.detail,
        contentLength: failure.contentPreview.length,
      });
    },
    errorCaptured(ctx, error) {
      telemetry.captureError(error, { ...ctx, mechanism: "llm" });
    },
  };
}
