import type { ReactNode } from "react";
import { useScreenViews } from "~/features/analytics/hooks/useScreenViews";

/**
 * The provider that reports screen views (`KIT_PROVIDERS`). It wraps the whole app rather
 * than sitting in a route, so it is one subscription for the whole navigator and no route
 * has to remember it; what it reports, and from what, is the hook's.
 */
export function AnalyticsScreenViews({ children }: { children: ReactNode }) {
  useScreenViews();
  return children;
}
