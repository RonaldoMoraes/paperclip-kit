import { createFileRoute } from "@tanstack/react-router";
import { KIT_SETTINGS_ACTIONS } from "~/app/kit.gen";
import { Settings } from "~/features/settings/screens/Settings";
import { APP_VERSION } from "~/lib/version";

/**
 * Settings: the version, and one row per action a module contributed (sign out, manage
 * billing, delete the account). Nothing to load — every row is a function the module
 * owns, and the screen only knows its label and tone.
 */
export const Route = createFileRoute("/_app/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  return <Settings version={APP_VERSION} actions={KIT_SETTINGS_ACTIONS} />;
}
