import { Alert } from "react-native";
import { deleteAccount } from "@contracts/account/delete-account";
import { ACCOUNT_COPY } from "@domain/account/copy";
import type { SettingsAction } from "~/kit.types";
import { authClient } from "~/lib/auth";
import { http } from "~/lib/http";
import { signOut } from "~/lib/session";

const C = ACCOUNT_COPY.settings;

/** The native confirmation, as a promise: the destructive road is the second button. */
function confirmDelete(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      C.deleteConfirmTitle,
      C.deleteConfirm,
      [
        { text: C.cancel, style: "cancel", onPress: () => resolve(false) },
        { text: C.confirmDelete, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/**
 * The two rows this module puts on Settings, in the order they appear. Neither
 * navigates: the session flip closes the app group and the gate lands on sign-in.
 */
export const settingsActions: SettingsAction[] = [
  {
    id: "sign-out",
    label: C.signOut,
    run: () => signOut(),
  },
  {
    id: "delete-account",
    label: C.deleteAccount,
    tone: "danger",
    run: async () => {
      if (!(await confirmDelete())) return;
      await deleteAccount(http);
      // The account is gone server-side; the sign-out is what drops the stored cookie and
      // flips the session here. Its answer is beside the point — refused or not, there is
      // no session left to keep.
      await signOut().catch(() => undefined);
      authClient.$store.notify("$sessionSignal");
    },
  },
];
