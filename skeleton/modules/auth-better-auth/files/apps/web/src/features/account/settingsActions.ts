import { deleteAccount } from "@contracts/account/delete-account";
import { AuthFlowError, SIGN_OUT_FAILED } from "@contracts/auth/errors";
import { ACCOUNT_COPY } from "@domain/account/copy";
import type { SettingsAction } from "~/app/kit.types";
import { authClient } from "~/lib/auth";
import { http } from "~/lib/http";
import { queryClient } from "~/lib/queryClient";
import { sessionKey } from "~/lib/session";

/**
 * After the session is gone, on either road out: every cached answer belonged to the
 * person who just left, the session query is settled as "nobody" so no route asks again
 * on the way, and the router goes to sign-in.
 *
 * The router is imported when the action runs, never at module load: `kit.gen.tsx`
 * imports this file, the route tree imports `kit.gen.tsx`, and the router imports the
 * route tree — a static import here would close that circle.
 */
async function leave(): Promise<void> {
  queryClient.clear();
  queryClient.setQueryData(sessionKey, null);
  const { router } = await import("~/app/router");
  await router.navigate({ to: "/account", replace: true });
}

/** The two rows this module puts on Settings, in the order they appear. */
export const settingsActions: SettingsAction[] = [
  {
    id: "sign-out",
    label: ACCOUNT_COPY.settings.signOut,
    run: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new AuthFlowError(error.message?.trim() || SIGN_OUT_FAILED);
      await leave();
    },
  },
  {
    id: "delete-account",
    label: ACCOUNT_COPY.settings.deleteAccount,
    tone: "danger",
    run: async () => {
      const { deleteConfirmTitle, deleteConfirm } = ACCOUNT_COPY.settings;
      if (!window.confirm(`${deleteConfirmTitle} ${deleteConfirm}`)) return;
      // Better Auth clears the cookie on the way out (`DELETE /api/account` forwards it);
      // the client side is the same road as a sign-out from here.
      await deleteAccount(http);
      await leave();
    },
  },
];
