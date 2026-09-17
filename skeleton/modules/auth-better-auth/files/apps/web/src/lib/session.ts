import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { SessionRecord } from "@contracts/auth/session";
import type { Gate } from "~/app/kit.types";
import { authClient } from "~/lib/auth";

/**
 * The session as one query.
 *
 * Better Auth still owns the session itself — this is its own `getSession()` call, cookie
 * cache and refresh included; nothing here reads or writes the cookie. Wrapping it in
 * Query is what lets the gate `await` it in `beforeLoad`, so a guarded route decides
 * before it renders instead of flashing a screen and bouncing a tick later.
 *
 * Only this file, `app/routes/account.tsx`, the account hooks and the Settings actions
 * read this key; every other screen takes the answer as a route decision it never sees.
 */
export const sessionKey = ["auth", "session"] as const;

/** What the auth client answers a probe with, as much of it as this file reads. */
type Probe = {
  user: { id: string; email: string; name?: string | null; emailVerified?: boolean };
  session: { id: string; userId: string; expiresAt: Date | string };
};

/**
 * The session as this app reads it: the contract's record, and beside it whatever a module
 * that claims the `auth-extensions` port put on the payload (`apps/server/src/auth/
 * auth.extensions.ts`, and `sessionExtraCookie` in mock mode). `unknown` on purpose — the
 * module that added a field is the one that knows its shape and parses it.
 */
export type SessionWithExtras = SessionRecord & Record<string, unknown>;

/**
 * The probe's answer as the contract's record: the narrow user, and the expiry back on
 * the wire as ISO-8601 — the auth client revives it into a `Date`, and a route reads the
 * same shape the mock and the server send.
 *
 * Everything else the probe carried rides along untouched. `SessionRecord` is a plain
 * `z.object`, so parsing drops every key it does not name; parse the two fields this file
 * owns and spread them over the rest, and an extension's field survives to the gate. The
 * merge rule is the server's and the mock's: extras first, `user` and `session` last, so
 * a field on the payload can add to the session and never rewrite who is signed in.
 * `carried` types as `{}` — this file cannot know what an extension added — but it holds
 * those keys at runtime, which is what the spec beside this pins.
 */
export function narrowSession(data: Probe): SessionWithExtras {
  const { user, session, ...carried } = data;
  return {
    ...carried,
    ...SessionRecord.parse({
      user,
      session: { id: session.id, userId: session.userId, expiresAt: new Date(session.expiresAt).toISOString() },
    }),
  };
}

/**
 * The query rejects when the probe cannot be answered, and rejects all the way out: the
 * retry in `queryClient` gets its turn, and nothing caches a signed-out answer the
 * network never gave.
 */
export const sessionQuery = () => ({
  queryKey: sessionKey,
  // Better Auth's cookie cache lasts five minutes server-side; a minute of client
  // freshness stays well inside it.
  staleTime: 60_000,
  queryFn: async (): Promise<SessionWithExtras | null> => {
    const { data, error } = await authClient.getSession();
    if (error) throw error;
    return data ? narrowSession(data) : null;
  },
});

/**
 * The session as a route reads it: a failure is "no session".
 *
 * A probe that 5xxes or never arrives leaves nothing to prove the person is signed in,
 * and sign-in is the one screen that can change that — an error screen would only leave
 * them stuck there. Writing the answer back settles it for the trip: the gate and
 * `/account` both read this key on the way to sign-in, and without this each would ask
 * again through another round of retries.
 */
export async function readSession(queryClient: QueryClient): Promise<SessionWithExtras | null> {
  try {
    return await queryClient.ensureQueryData(sessionQuery());
  } catch {
    queryClient.setQueryData(sessionKey, null);
    return null;
  }
}

/**
 * The session after something changed it — a verified code, a provider landing. The
 * cached answer is dropped and the probe asked again, so the gate on the next route reads
 * the session the person now has rather than the one they arrived with.
 */
export async function refreshSession(queryClient: QueryClient): Promise<SessionWithExtras | null> {
  queryClient.removeQueries({ queryKey: sessionKey });
  return readSession(queryClient);
}

/**
 * The gate: every route under `_app` needs a session. `beforeLoad` awaits it, so the
 * decision is made before anything renders; where the person was going travels with them
 * as `?redirect=`, so signing in finishes the trip they started. The session it resolved
 * goes into the router context, so a guarded route reads the signed-in user from the
 * decision that let it render instead of asking for it again.
 */
export const requireSession: Gate = async ({ queryClient, location }) => {
  const session = await readSession(queryClient);
  if (!session) throw redirect({ to: "/account", search: { redirect: location.href }, replace: true });
  return { session };
};

declare module "~/app/kit.types" {
  interface GateContext {
    session: SessionWithExtras;
  }
}
