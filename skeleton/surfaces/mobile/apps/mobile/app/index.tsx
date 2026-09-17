import { Redirect } from "expo-router";
import { useAppGates } from "~/features/shell/hooks/useAppGates";

/**
 * Where a launch becomes a destination. Every gate is read once; the first that asks for
 * a redirect gets it (a signed-out user to the auth module's sign-in, say), and with none
 * asking the user lands on the first tab. Nothing renders while a gate is still pending:
 * the native splash covers the wait, and the root layout brings it down when `ready`.
 */
export default function Index() {
  const { ready, redirectTo } = useAppGates();

  if (!ready) return null;

  return <Redirect href={redirectTo ?? "/(app)/(tabs)/example"} />;
}
