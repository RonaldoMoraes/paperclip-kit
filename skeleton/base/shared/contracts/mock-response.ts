import { HttpResponse } from "msw";
import type { ApiError, ApiErrorCode } from "./errors";

/**
 * A JSON mock response with a string body. `HttpResponse.json` wraps the body in a
 * stream, which React Native's `fetch` reads back as an empty string; a plain string
 * body is readable on every runtime the mocks run in.
 *
 * `setCookies` is for a mock that must persist more than one ledger in one answer,
 * appended so every runtime's `getSetCookie()` reads them all; a lone `set-cookie` in
 * `headers` still works for a mock with one.
 */
export function json(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string>; setCookies?: string[] }
): HttpResponse<string> {
  const headers = new Headers({ "content-type": "application/json", ...init?.headers });
  for (const cookie of init?.setCookies ?? []) headers.append("set-cookie", cookie);
  return new HttpResponse(JSON.stringify(body), { status: init?.status ?? 200, headers });
}

/**
 * A refusal in the server's own envelope (`errors.ts`), so a mocked failure reaches a
 * screen as the same `HttpError` a real one does and no mock writes a literal body.
 */
export function apiError(status: number, code: ApiErrorCode, message: string): HttpResponse<string> {
  return json({ code, message } satisfies ApiError, { status });
}

/** The refusal every authenticated mock answers with when the request carries no session. */
export function unauthorized(): HttpResponse<string> {
  return apiError(401, "UNAUTHORIZED", "Sign in first.");
}

/** The refusal for an id nothing answers to. */
export function notFound(message = "That isn't here."): HttpResponse<string> {
  return apiError(404, "NOT_FOUND", message);
}
