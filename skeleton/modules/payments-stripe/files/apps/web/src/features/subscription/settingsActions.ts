import { SUBSCRIPTION_COPY } from "@domain/subscription/copy";
import type { SettingsAction } from "~/app/kit.types";

/**
 * The row this module puts on Settings: the way to the plan screen.
 *
 * The router is imported when the row runs, never at module load: `kit.gen.tsx` imports this
 * file, the route tree imports `kit.gen.tsx`, and the router imports the route tree — a
 * static import here would close that circle.
 *
 * The row leads to `/subscription` rather than straight to Stripe because that screen is
 * where what is held is actually shown; it also sits behind the entitlement layout, so
 * somebody whose plan lapsed lands on the paywall, which is where their card can be fixed.
 */
export const settingsActions: SettingsAction[] = [
  {
    id: "subscription",
    label: SUBSCRIPTION_COPY.settings.subscription,
    run: async () => {
      const { router } = await import("~/app/router");
      await router.navigate({ to: "/subscription" });
    },
  },
];
