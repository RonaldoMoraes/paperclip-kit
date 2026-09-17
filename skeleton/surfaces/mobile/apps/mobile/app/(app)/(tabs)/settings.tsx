import { useSettingsActions } from "~/features/settings/hooks/useSettingsActions";
import { Settings } from "~/features/settings/screens/Settings";
import { versionLabel } from "~/lib/version";

export default function SettingsRoute() {
  const settings = useSettingsActions();

  return (
    <Settings
      actions={settings.actions}
      version={versionLabel()}
      onRun={settings.run}
      pending={settings.pending}
      error={settings.error}
    />
  );
}
