import { ActivityIndicator, View } from "react-native";
import { SHELL_COPY } from "@domain/copy";

/**
 * What a route renders while its `use<Feature>Facts` hook is still pending. The screen
 * itself never holds this branch — it takes props and renders the state it is given — so
 * the wait is the same on every tab, and a spec renders the screen with data directly.
 * Named for the route, not the feature: `mobile-ui-imports.grit` bans the web's
 * `@ui/components/ScreenPending`, which renders DOM; this is the phone's.
 */
export function ScreenPending() {
  return (
    <View
      testID="screen-pending"
      accessibilityLabel={SHELL_COPY.pending}
      className="flex-1 items-center justify-center bg-canvas"
    >
      <ActivityIndicator />
    </View>
  );
}
