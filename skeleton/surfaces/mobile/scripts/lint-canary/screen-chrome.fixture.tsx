// Deliberate violation: a screen that pins the status bar and reads the navigator.
import { useRouter } from "expo-router";
import { StatusBar, View } from "react-native";

export function LintCanary() {
  const router = useRouter();
  return (
    <View onLayout={() => router.back()}>
      <StatusBar barStyle="light-content" />
    </View>
  );
}
