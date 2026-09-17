import type { LlmToolCall, LlmUsage } from "../llm.types";
import type {
  LlmProviderAdapter,
  ProviderCallSettings,
  ProviderErrorCategory,
  ProviderResult,
  ProviderStreamEvent,
} from "./provider.types";

type ScriptedResponse = string | ((settings: ProviderCallSettings) => string);

type ScriptedEntry =
  | { kind: "response"; response: ScriptedResponse }
  | { kind: "tool_calls"; toolCalls: LlmToolCall[]; text: string }
  | { kind: "error"; error: FakeProviderError };

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Deterministic ~3-word chunks whose concatenation is exactly the input. */
function chunkText(text: string): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3).join(" ");
    chunks.push(i === 0 ? chunk : ` ${chunk}`);
  }
  return chunks;
}

/** A scripted vendor failure carrying its classification, so failover is testable with no network. */
export class FakeProviderError extends Error {
  constructor(
    readonly category: ProviderErrorCategory,
    message = `[fake] scripted ${category} failure`
  ) {
    super(message);
    this.name = "FakeProviderError";
  }
}

/**
 * The no-network, no-keys adapter: wired in by LlmModule when LLM_MODE=fake,
 * constructed directly in unit tests. Same input, same output, across runs and
 * machines; `calls` records every invocation as the assertion surface for what
 * was actually sent.
 */
export class FakeLlmProvider implements LlmProviderAdapter {
  readonly name = "fake" as const;
  readonly calls: ProviderCallSettings[] = [];
  private readonly queue: ScriptedEntry[] = [];

  /** `delayMs` spaces stream chunks out for watching streams in dev — never set in tests. */
  constructor(private readonly options: { delayMs?: number } = {}) {}

  /** FIFO scripting; each call consumes one entry, falling back to the deterministic default. */
  enqueue(response: ScriptedResponse): void {
    this.queue.push({ kind: "response", response });
  }

  /** Scripts a classified failure into the same FIFO: the call that consumes it throws. */
  enqueueError(category: ProviderErrorCategory, message?: string): void {
    this.queue.push({ kind: "error", error: new FakeProviderError(category, message) });
  }

  /**
   * Scripts a tool-call turn into the same FIFO: the call that consumes it
   * finishes with "tool_calls" and these calls (plus any accompanying text) —
   * an agent conversation scripts one of these per loop step, then a final
   * response. Hosted tools stay inert: they only ever show up in `calls`.
   */
  enqueueToolCalls(toolCalls: LlmToolCall[], text = ""): void {
    this.queue.push({ kind: "tool_calls", toolCalls, text });
  }

  complete(settings: ProviderCallSettings): Promise<ProviderResult> {
    this.calls.push(settings);
    const entry = this.queue.shift();
    if (entry?.kind === "error") return Promise.reject(entry.error);
    if (entry?.kind === "tool_calls") {
      const outputChars = entry.text + entry.toolCalls.map((call) => call.argumentsJson).join("");
      return Promise.resolve({
        text: entry.text,
        toolCalls: entry.toolCalls,
        usage: this.usageFor(settings, outputChars),
        finishReason: "tool_calls",
      });
    }
    const text = this.responseFor(settings, entry?.response);
    return Promise.resolve({ text, usage: this.usageFor(settings, text), finishReason: "stop" });
  }

  async *stream(settings: ProviderCallSettings, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    this.calls.push(settings);
    const entry = this.queue.shift();
    // A scripted error throws before any delta — the pre-delta failure shape.
    if (entry?.kind === "error") throw entry.error;
    if (entry?.kind === "tool_calls") {
      // The stream path carries no tool events (an agent loop streams only its
      // final turn); a scripted tool-call turn ends with the honest non-"stop"
      // finish, which the service treats as a failed stream.
      yield { type: "done", usage: this.usageFor(settings, entry.text), finishReason: "tool_calls" };
      return;
    }
    const text = this.responseFor(settings, entry?.response);
    for (const chunk of chunkText(text)) {
      // Once aborted, stop yielding and return without a `done` event — exactly
      // the upstream shape the service's abort path expects.
      if (signal?.aborted) return;
      if (this.options.delayMs) await delay(this.options.delayMs);
      yield { type: "delta", text: chunk };
    }
    if (signal?.aborted) return;
    yield { type: "done", usage: this.usageFor(settings, text), finishReason: "stop" };
  }

  classifyError(error: unknown): ProviderErrorCategory {
    return error instanceof FakeProviderError ? error.category : "other";
  }

  private responseFor(settings: ProviderCallSettings, scripted: ScriptedResponse | undefined): string {
    if (typeof scripted === "function") return scripted(settings);
    if (typeof scripted === "string") return scripted;
    // Unscripted json is "{}" on purpose: a structured test relying on the
    // default is a test bug, and "{}" fails any non-empty schema loudly.
    if (settings.responseFormat === "json") return "{}";
    const lastUser = [...settings.messages].reverse().find((message) => message.role === "user");
    return `[fake:${settings.model}] ${(lastUser?.content ?? "").slice(0, 80)}`;
  }

  /** Deterministic fake counts — nonzero and stable, so usage plumbing is assertable. */
  private usageFor(settings: ProviderCallSettings, text: string): LlmUsage {
    const promptChars = settings.messages.reduce((sum, message) => sum + message.content.length, 0);
    return { inputTokens: Math.ceil(promptChars / 4), outputTokens: Math.ceil(text.length / 4) };
  }
}
