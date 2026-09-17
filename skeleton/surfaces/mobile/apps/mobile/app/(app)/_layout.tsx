import { Stack } from "expo-router";
import { StatusBar, useColorScheme } from "react-native";

/**
 * The app group: the tabs the user lives in, and the screens pushed over them. A detail
 * is somewhere he visits and leaves, so it is a push, not a tab. A module that adds a
 * screen to the signed-in app adds its route file here and it joins the stack.
 *
 * Every screen in here sits on `bg-canvas`, which follows the scheme — so the status bar
 * has to as well, or the clock disappears into the ground.
 */
export default function AppLayout() {
  const scheme = useColorScheme();

  return (
    <>
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="example/[id]" />
      </Stack>
    </>
  );
}
