import { Tabs } from "expo-router";
import { type TabName, isTabName } from "@domain/shell/tabs";
import { TabBar } from "~/features/shell/components/TabBar";

/** what the adapter reads of `BottomTabBarProps`: which route is on top, and the way to another */
type ShellTabBarProps = {
  state: { index: number; routes: { name: string }[] };
  navigation: { navigate: (destination: TabName) => void };
};

/**
 * The destinations, with the navigator's own bar replaced by the floating pill. The
 * adapter is the whole of the wiring: `TabBar` takes the active name and a callback, so it
 * renders in a spec without a navigator behind it. `onSelect` is the bar's one
 * hand-driven exit — a module that counts taps (analytics) reports them here, not in
 * the bar, because a `router.push` or a closing guard never passes through it.
 */
export function ShellTabBar({ state, navigation }: ShellTabBarProps) {
  // The navigator's route name is a string. Anything the bar has no destination for
  // highlights nothing, rather than falling back to the first tab and lying about where
  // the user is.
  const name = state.routes[state.index]?.name;

  return <TabBar active={isTabName(name) ? name : undefined} onSelect={(tab) => navigation.navigate(tab)} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      // The bar floats over the screens rather than reserving a strip under them, so the
      // navigator must not lay it out — every tabbed screen pads its own bottom instead.
      tabBar={(props) => <ShellTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
    >
      <Tabs.Screen name="example" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
