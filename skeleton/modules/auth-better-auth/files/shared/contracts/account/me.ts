import type { z } from "zod";
import { SessionUser } from "../auth/session";
import type { Http } from "../http";

/**
 * `GET /api/account/me` — who is signed in, as the contract's narrow user; `401
 * UNAUTHORIZED` for nobody. The reference for a guarded endpoint: the server resolves the
 * session in `SessionGuard`, the mock resolves it from the cookie, and a screen reads it
 * through this query rather than through the auth client.
 */
export const MeResponse = SessionUser;
export type MeResponse = z.infer<typeof MeResponse>;

export function getMe(http: Http): Promise<MeResponse> {
  return http.get("/api/account/me", MeResponse);
}

export function meQuery(http: Http) {
  return {
    queryKey: ["account", "me"] as const,
    // Who is signed in changes only through sign-in and sign-out, which invalidate it.
    staleTime: 60_000,
    queryFn: () => getMe(http),
  };
}
