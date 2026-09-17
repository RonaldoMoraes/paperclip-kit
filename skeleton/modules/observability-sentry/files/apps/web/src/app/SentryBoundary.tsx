import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import { SHELL_COPY } from "@domain/copy";
import { Button } from "@ui/components/Button";
import type { Provider } from "~/app/kit.types";
import { Screen } from "~/features/shell/components/Screen";
import { sentryDsn } from "~/lib/sentry";

/**
 * What stands in for the app when a render throws above the router — the one crash the
 * route error component cannot catch, because the router is what crashed. Its words are
 * `RouteError`'s, inline as they are there; `resetError` mounts the tree again, and the
 * query cache outside it survives.
 */
function CrashScreen({ resetError }: { resetError: () => void }) {
  return (
    <Screen tag="crash" center>
      <h1 data-testid="crash-title" className="font-serif text-title-1 text-ink">
        Something went wrong.
      </h1>
      <p className="mt-3 text-ink-secondary">That didn't load. Try again in a moment.</p>
      <Button size="lg" className="mt-8 w-full" data-testid="crash-retry" onClick={resetError}>
        {SHELL_COPY.error.retry}
      </Button>
    </Screen>
  );
}

/**
 * `KIT_PROVIDERS`: Sentry's error boundary around the router, so a render crash is
 * reported with its component stack and the user gets a screen instead of a blank page.
 * Without a DSN it is the children as they are — no boundary, no SDK, the same tree a
 * build without this module renders.
 */
export const SentryBoundary: Provider = ({ children }: { children: ReactNode }) => {
  if (sentryDsn() === null) return <>{children}</>;
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <CrashScreen resetError={resetError} />}>
      {children}
    </Sentry.ErrorBoundary>
  );
};
