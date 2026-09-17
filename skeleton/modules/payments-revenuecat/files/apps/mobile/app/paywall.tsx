import { Redirect } from "expo-router";
import { StatusBar, useColorScheme } from "react-native";
import { usePaywall } from "~/features/subscription/hooks/usePaywall";
import { useStoreAccess } from "~/features/subscription/hooks/useStoreAccess";
import { Paywall } from "~/features/subscription/screens/Paywall";

/**
 * The paywall, beside `index` rather than inside `(app)`: it is where the access gate sends
 * people, so it cannot itself sit behind that gate.
 *
 * Somebody who already has a plan is walked on to `index`, which turns the resolved gates
 * into a destination — otherwise the wall would sell a second subscription the store would
 * refuse. Nothing renders while the session is still being read; the splash covers it.
 */
export default function PaywallRoute() {
  const scheme = useColorScheme();
  const { access, pending } = useStoreAccess();
  const wall = usePaywall();

  if (pending) return null;
  if (access.active) return <Redirect href="/" />;

  return (
    <>
      {/* The screen sits on `bg-canvas`, which follows the scheme — so the clock has to as
          well, or it disappears into the ground. */}
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      <Paywall
        offering={wall.offering}
        trialEligible={wall.trialEligible}
        unavailable={wall.unavailable}
        pending={wall.pending}
        error={wall.error}
        onBuy={wall.buy}
        onRestore={wall.restore}
        onRetry={wall.retry}
        onOpenTerms={wall.openTerms}
        onOpenPrivacy={wall.openPrivacy}
      />
    </>
  );
}
