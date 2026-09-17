/**
 * What may leave the process, decided by key.
 *
 * Telemetry fields are identifiers and shapes — a request id, a route, a code, a count.
 * A key that names a body, a preview or a credential is where a person's text or health
 * data would hide, so the Sentry sink drops it at any depth before the SDK sees it, and
 * the console sink blanks the credential-shaped ones. By key rather than by value: a value
 * that looks harmless under a key called `body` is still a body.
 */
export const SENTRY_DROP_KEY = /preview|body|content|payload|cookie|header|authorization|secret|token|password|query/i;
export const CREDENTIAL_KEY = /secret|token|password|authorization|cookie/i;
export const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

export type DescribedError = { name: string; message: string; stack?: string };

/** What a thrown value looks like as data — `JSON.stringify(new Error())` is `{}`. */
export function describeError(error: unknown): DescribedError {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "NonError", message: String(error) };
}

/** A URL without what follows `?` or `#` — a query string is where an id or a token rides. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

type Decision = "keep" | "drop" | "redact";

function walk(value: unknown, depth: number, seen: WeakSet<object>, decide: (key: string) => Decision): unknown {
  if (value instanceof Error) return walk(describeError(value), depth, seen, decide);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH || seen.has(value)) return "[omitted]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, seen, decide));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const decision = decide(key);
    if (decision === "drop") continue;
    out[key] = decision === "redact" ? REDACTED : walk(item, depth + 1, seen, decide);
  }
  return out;
}

/** `fields` with every `SENTRY_DROP_KEY` key gone at any depth, errors described, cycles cut. */
export function scrubForSentry(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  return walk(fields ?? {}, 0, new WeakSet(), (key) => (SENTRY_DROP_KEY.test(key) ? "drop" : "keep")) as Record<
    string,
    unknown
  >;
}

/** `fields` with every credential-shaped value replaced and its key kept, errors described, cycles cut. */
export function redactCredentials(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  return walk(fields ?? {}, 0, new WeakSet(), (key) => (CREDENTIAL_KEY.test(key) ? "redact" : "keep")) as Record<
    string,
    unknown
  >;
}
