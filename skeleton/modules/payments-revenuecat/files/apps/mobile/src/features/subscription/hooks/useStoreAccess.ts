import type { SessionUser } from "@contracts/auth/session";
import { type SubscriptionAccess, readSubscriptionAccess } from "@contracts/subscription/access";
import { authClient } from "~/lib/auth";
import { readSignedIn } from "~/lib/session";

export type StoreAccessRead = {
  /** what the server says may be used, as it rides on the session */
  access: SubscriptionAccess;
  /** the session's own user — who the store's customer must be before anything is sold */
  user: SessionUser | null;
  signedIn: boolean;
  /** the stored session has not been read yet; nothing may be decided on it */
  pending: boolean;
};

/**
 * The stored session, read once: who this is, whether they are signed in, and what they may
 * use.
 *
 * Every door on the phone needs some of those three and none of them parses the session
 * itself, so they come off one `useSession()` here. Access is the server's answer riding on
 * the session — the store sells, the server decides — and this is the whole of what the app
 * reads. Nothing here derives entitlement from anything the SDK said.
 *
 * Nothing is blanked while the read is pending: `user` and `access` are whatever the client
 * is holding, and callers branch on `pending` before reading either.
 */
export function useStoreAccess(): StoreAccessRead {
  const { data, isPending } = authClient.useSession();

  return {
    access: readSubscriptionAccess(data),
    user: data?.user ?? null,
    signedIn: readSignedIn(data, isPending),
    pending: isPending,
  };
}
