import { z } from "zod";

/**
 * The one shape a failed `/api` call answers with.
 *
 * Every app reads a failure the same way: `code` is what it branches on, `message` is what
 * it may show, `issues` is zod's own account of a rejected body and is only ever a
 * developer's diagnostic. A module that mounts a third-party router under `/api` (an auth
 * server, say) documents its own exception in its own `errors.ts`.
 */
export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  issues: z.array(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/**
 * The codes the base server sends, as a closed set.
 *
 * A client branches on these; the string is the contract, so a code is added in the same
 * change as the server that first sends it. A module with conditions of its own widens the
 * union in its own `<module>/errors.ts` rather than here, so base never names a feature.
 */
export const API_ERROR_CODES = [
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * The envelope in a response body, or `null` when the body is not one.
 *
 * An unparseable body is not an error worth reporting on its own: a proxy's HTML error
 * page, an empty 502 and a JSON body of the wrong shape all mean the same thing to a
 * client — the call failed and the server said nothing it can use — and the caller falls
 * back to the status.
 */
export function parseApiError(body: unknown): ApiError | null {
  const parsed = ApiError.safeParse(body);
  return parsed.success ? parsed.data : null;
}
