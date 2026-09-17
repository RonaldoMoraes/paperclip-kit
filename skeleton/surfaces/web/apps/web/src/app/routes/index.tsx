import { createFileRoute, redirect } from "@tanstack/react-router";

/** The root has nothing to show of its own: the app opens on the first destination. */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/example", replace: true });
  },
});
