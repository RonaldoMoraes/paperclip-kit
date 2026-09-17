import { HttpStatus } from "@nestjs/common";
import { APIError } from "better-auth/api";
import type { DeleteAccountResponse } from "@contracts/account/delete-account";
import type { MeResponse } from "@contracts/account/me";
import type { SessionContext } from "../auth/session.guard";
import { ApiException, codeForStatus } from "../common/api-error";

/** The one line for a session too old to delete an account on; the client's `stale-session` reason. */
export const SIGN_IN_AGAIN = "Sign in again, then delete your account.";

/**
 * The signed-in user, as the contract's narrow `SessionUser`: only the fields the apps
 * read. Better Auth's own payload carries more (timestamps, an image), and the wire shape
 * is decided here rather than by whatever the auth library adds next.
 */
export function readMe(session: SessionContext): MeResponse {
  const { id, email, name, emailVerified } = session.user;
  return { id: String(id), email, name: name || null, emailVerified };
}

/** What the delete path asks of Better Auth: its own endpoint, headers in, headers out. */
export type AccountAuth = {
  deleteUser(input: {
    headers: Headers;
    body: Record<string, never>;
    returnHeaders: true;
  }): Promise<{ headers: Headers; response: unknown }>;
};

export type DeleteAccountDeps = {
  auth: AccountAuth;
};

/**
 * Deletes the signed-in user through Better Auth — the row, and with it every session
 * and account (`onDelete: Cascade`) — and hands back the `Set-Cookie` lines that clear
 * the session on the caller's side, for the controller to forward.
 *
 * Better Auth refuses a session older than its `freshAge` when no password can be shown
 * (an email-code user has none): that is `SESSION_EXPIRED`, answered here as `FORBIDDEN`
 * so the client tells them to sign in again rather than showing a failure. Any other
 * refusal keeps its status in the envelope; a bug is a bug.
 */
export async function deleteAccount(
  deps: DeleteAccountDeps,
  headers: Headers
): Promise<{ body: DeleteAccountResponse; setCookie: string[] }> {
  try {
    const { headers: answered } = await deps.auth.deleteUser({ headers, body: {}, returnHeaders: true });
    return { body: { deleted: true }, setCookie: answered.getSetCookie() };
  } catch (error) {
    throw refusal(error);
  }
}

function refusal(error: unknown): unknown {
  if (!(error instanceof APIError)) return error;
  if (error.body?.code === "SESSION_EXPIRED" || /session expired/i.test(error.message)) {
    return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", SIGN_IN_AGAIN);
  }
  const status = error.statusCode;
  return new ApiException(status, codeForStatus(status), error.body?.message ?? error.message);
}
