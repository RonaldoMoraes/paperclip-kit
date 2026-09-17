import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { SHELL_COPY } from "@domain/copy";
import { Button } from "@ui/components/Button";
import { Screen } from "~/features/shell/components/Screen";

/** Every route's error component: a failed loader is a screen the user can retry from, never a blank page. */
export function RouteError(_: ErrorComponentProps) {
  const router = useRouter();
  return (
    <Screen tag="route-error" center>
      <h1 className="font-serif text-title-1 text-ink">{SHELL_COPY.error.title}</h1>
      <p className="mt-3 text-ink-secondary">{SHELL_COPY.error.body}</p>
      <Button size="lg" className="mt-8 w-full" data-testid="route-error-retry" onClick={() => router.invalidate()}>
        {SHELL_COPY.error.retry}
      </Button>
    </Screen>
  );
}
