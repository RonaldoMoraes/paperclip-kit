import { useMutation } from "@tanstack/react-query";
import { AuthFlowError, SIGN_OUT_FAILED } from "@contracts/auth/errors";
import { authClient } from "~/lib/auth";
import { readSignedIn, signOut } from "~/lib/session";

/**
 * Sign out, for a screen of the product's own that wants a button rather than the
 * Settings row (`settingsActions.ts` runs the same `signOut`).
 *
 * No imperative navigation: the app group sits behind `Stack.Protected`, and replacing
 * the route before the session flips aims at a screen the stack does not have yet.
 * Signing out and letting the session flip is what closes the group — the router
 * removes it, history and all, and lands the person on sign-in by itself. `pending`
 * therefore tracks the wait rather than the request: the request is quick, the flip a
 * moment later, and until it lands the screen is still there and the button has to
 * speak for the whole wait.
 */
export function useSignOut(): { signOut: () => void; pending: boolean; error: string | null } {
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const {
    mutate,
    isPending,
    isSuccess,
    error: failure,
  } = useMutation({
    mutationFn: async () => {
      await signOut();
      // The refetch is what flips the session and closes the signed-in group.
      await refetchSession();
    },
  });

  return {
    signOut: () => mutate(),
    pending: isPending || (isSuccess && readSignedIn(session, false)),
    // Not `authFailureMessage`: a throw that never reached the mapping is still a refused
    // sign-out, and this says so more usefully than the generic line.
    error: failure ? (failure instanceof AuthFlowError ? failure.message : SIGN_OUT_FAILED) : null,
  };
}
