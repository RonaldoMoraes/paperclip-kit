import type { ZodType } from "zod";
import type { LlmMessage, LlmTurnMessage } from "./llm.types";

export type StructuredOutputFailureKind = "invalid-json" | "schema-mismatch" | "empty-json" | "empty-response";

export interface StructuredOutputFailure {
  kind: StructuredOutputFailureKind;
  /** Parse error message or stringified Zod issues. */
  detail: string;
}

export type StructuredValidation<T> =
  | { ok: true; value: T; cleaned: string }
  | { ok: false; cleaned: string; failure: StructuredOutputFailure };

/**
 * Clean → parse → Zod-validate one model response. Shared by the structured
 * prompt path (llm.service.ts) and the agent loop's structured final output
 * (agents/) — one validation, one vocabulary of failures.
 */
export function validateStructuredResponse<T>(text: string, schema: ZodType<T>): StructuredValidation<T> {
  const cleaned = cleanJsonResponse(text);
  if (!cleaned) {
    return { ok: false, cleaned, failure: { kind: "empty-response", detail: "response is empty after cleaning" } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, cleaned, failure: { kind: "invalid-json", detail } };
  }
  if (parsed === null) {
    return { ok: false, cleaned, failure: { kind: "empty-json", detail: "parsed JSON is null" } };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, cleaned, failure: { kind: "schema-mismatch", detail: JSON.stringify(result.error.issues) } };
  }
  return { ok: true, value: result.data, cleaned };
}

/**
 * Strip markdown fences and, when prose surrounds it, extract the first
 * `{…}`/`[…]` block. Gemini is the provider most prone to fenced output —
 * this layer exists largely for it.
 */
export function cleanJsonResponse(content: string): string {
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```\s*$/i, "");

  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");
  const firstIndex =
    firstObject === -1 ? firstArray : firstArray === -1 ? firstObject : Math.min(firstObject, firstArray);

  if (firstIndex !== -1) {
    const lastObject = cleaned.lastIndexOf("}");
    const lastArray = cleaned.lastIndexOf("]");
    const lastIndex = Math.max(lastObject, lastArray);
    if (lastIndex > firstIndex) {
      cleaned = cleaned.slice(firstIndex, lastIndex + 1);
    }
  }

  return cleaned;
}

/**
 * The repair conversation: a fresh prompt that carries the original messages,
 * the invalid output and the validation failure, and asks for corrected JSON.
 * The service runs it as one single-attempt call — repair calls never trigger
 * their own repair.
 */
export function buildRepairMessages(
  originalMessages: LlmTurnMessage[],
  invalidContent: string,
  failure: StructuredOutputFailure
): LlmMessage[] {
  return [
    {
      role: "system",
      content:
        "You repair malformed LLM outputs into valid structured JSON. Return only JSON. " +
        "Do not add explanations, markdown fences, or commentary.",
    },
    {
      role: "user",
      content: `Repair the invalid output below so it satisfies the original request.

Original request messages:
${JSON.stringify(originalMessages, null, 2)}

Invalid output:
${invalidContent}

Validation failure:
${failure.kind}

Validation details:
${failure.detail}

Return only corrected JSON.`,
    },
  ];
}
