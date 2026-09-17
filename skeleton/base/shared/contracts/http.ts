import type { ZodType } from "zod";
import { parseApiError } from "./errors";

/**
 * The transport a contract call runs on. Each app implements it once (`src/lib/http.ts`):
 * the web app over same-origin fetch with the cookie jar, the Expo app over `API_URL`
 * with the session as a `Cookie` header. Contracts never see either — they take an
 * `Http` and return parsed data, so one call is the same on every platform:
 * `setItemDone(http, id, done)`.
 */
export type Http = {
  get<T>(path: string, schema: ZodType<T>): Promise<T>;
  post<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T>;
  put<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T>;
  patch<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T>;
  delete<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T>;
};

/**
 * Thrown by an `Http` for any non-2xx answer.
 *
 * `status` is what a screen branches on when all it needs is "did this work"; `code` is
 * the server's own name for the failure (`errors.ts`) and is what it branches on to say
 * something specific. `code` and `issues` are absent whenever the body did not carry the
 * envelope — a proxy's error page, an empty 502 — so a reader of either must handle their
 * absence.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly issues?: unknown[]
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * One request, as the two `Http` implementations state it.
 *
 * Structural, never `RequestInit`: a contract module names no platform, and each app
 * spreads this into its own `fetch` call with the credentials that platform needs.
 */
export type JsonRequest = {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  /** deliver even after the page is gone — a fire-and-forget call whose answer nobody reads */
  keepalive?: boolean;
};

const withBody =
  (method: string) =>
  (body?: unknown): JsonRequest => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** The five verbs `Http` offers, so web and mobile cannot serialise a body differently. */
export const jsonRequest = {
  get: (): JsonRequest => ({ method: "GET" }),
  post: withBody("POST"),
  put: withBody("PUT"),
  patch: withBody("PATCH"),
  delete: withBody("DELETE"),
};

/** A failure body that says only what went wrong — a framework's default shape, and a bare 500's. */
function messageOnly(body: unknown): string | null {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.length > 0 ? message : null;
}

/**
 * The error a failed response becomes, envelope or not.
 *
 * Shared by both `Http` implementations so web and mobile cannot end up meaning two
 * different things by the same failure. Pure: the caller reads the body, this decides
 * what it says. A body carrying a message but no code is still better copy than the
 * status; it is reported as `INTERNAL`, because a client may only branch on a code the
 * server actually named.
 */
export function httpErrorFrom(path: string, status: number, body: unknown): HttpError {
  const parsed = parseApiError(body);
  if (parsed) return new HttpError(status, parsed.message, parsed.code, parsed.issues);

  const message = messageOnly(body);
  if (message) return new HttpError(status, message, "INTERNAL");

  return new HttpError(status, `${path} responded ${status}`);
}
