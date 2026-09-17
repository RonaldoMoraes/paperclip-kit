import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { KIT_PROVIDERS } from "~/app/kit.gen";
import { router } from "~/app/router";
import { queryClient } from "~/lib/queryClient";

/**
 * The app's providers, outermost first: Query, Motion, then every module's provider in
 * the order the scaffold listed them, around the router. A module that needs a context
 * (an analytics client, an experiments seam) contributes it through `KIT_PROVIDERS`
 * rather than by editing this file.
 */
function KitProviders({ children }: { children: ReactNode }) {
  return KIT_PROVIDERS.reduceRight((inner, Provider) => <Provider>{inner}</Provider>, children);
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <KitProviders>
          <RouterProvider router={router} />
        </KitProviders>
      </MotionConfig>
    </QueryClientProvider>
  );
}
