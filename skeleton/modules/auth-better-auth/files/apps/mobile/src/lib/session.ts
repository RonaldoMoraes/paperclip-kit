import { AuthFlowError, SIGN_OUT_FAILED } from "@contracts/auth/errors";
import type { Boot, Gate } from "~/kit.types";
import { authClient } from "~/lib/auth";
import { addRequestHeaders } from "~/lib/http";

/**
 * Whether a session is in hand, read the one way the gate and the sign-out button both
 * read it: a payload with a `session` on it, once the probe has answered. Pending is
 * never signed in — a group opened on a guess closes under the person a moment later.
 */
export function readSignedIn(session: unknown, pending: boolean): boolean {
  return !pending && Boolean((session as { session?: unknown } | null | undefined)?.session);
}

/**
 * Puts the session on every request the transport makes. A React Native fetch has no
 * cookie jar, so the cookie the auth client keeps in SecureStore is the whole session;
 * read per request, so a session that lands after the first call is carried by the next.
 * Returns the removal, for a spec.
 */
export function installSessionHeader(): () => void {
  return addRequestHeaders((): Record<string, string> => {
    const cookie = authClient.getCookie();
    return cookie ? { Cookie: cookie } : {};
  });
}

/** The module's boot step (`KIT_BOOT`): the session header, once, before anything mounts. */
export const bootSession: Boot = () => {
  installSessionHeader();
};

/**
 * The module's gate (`KIT_GATES`): the app group opens on a session, and a launch without
 * one goes to sign-in. Pending holds the splash rather than answering either way.
 */
export const useSessionGate: Gate = () => {
  const { data, isPending } = authClient.useSession();
  const signedIn = readSignedIn(data, isPending);
  return { ready: !isPending, allow: signedIn, redirectTo: signedIn ? undefined : "/sign-in" };
};

/**
 * Sign out, on the phone: the server deletes the session, the client drops the stored
 * cookie from the cleared `Set-Cookie`, and the session store is told — which is what
 * flips `useSession()`, closes the app group and lands the person on sign-in by itself.
 * No imperative navigation: sign-in is where the resolved gate sends them.
 */
export async function signOut(): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new AuthFlowError(error.message?.trim() || SIGN_OUT_FAILED);
  authClient.$store.notify("$sessionSignal");
}
