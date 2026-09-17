import { Redirect } from "expo-router";

/**
 * Every URL the route map does not have — a stale push link, a mistyped deep link — lands
 * here, and this hands it straight to `index`, which is where the resolved gates become a
 * destination for every other door too. Without this file Expo Router shows its own
 * "Unmatched Route" developer screen, which is a dead end in a shipped build.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
