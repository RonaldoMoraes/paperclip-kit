import { createFileRoute, redirect } from "@tanstack/react-router";
import { getItemQuery } from "@contracts/example/get-item";
import { rememberVisitedItem } from "~/data/store";
import { useExampleActions } from "~/features/example/hooks/useExampleActions";
import { useExampleItem } from "~/features/example/hooks/useExampleItems";
import { ExampleDetail } from "~/features/example/screens/ExampleDetail";
import { HttpError, http } from "~/lib/http";

/**
 * An item is inside the list's destination: same shell, the same tab stays lit. An id the
 * server does not carry — a dead link, a typo — goes back to the list rather than to an
 * error screen; the list is the honest answer to "that one is gone". Only the 404: any
 * other failure — a 500, a dropped connection — is a valid deep link the user should be
 * able to retry, so it rethrows to the router's error surface instead of being eaten.
 */
export const Route = createFileRoute("/_app/example/$id")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(getItemQuery(http, params.id)).catch((error) => {
      if (error instanceof HttpError && error.status === 404) throw redirect({ to: "/example", replace: true });
      throw error;
    });
    // only an item that exists is worth remembering — the store is device-side and the list marks it
    rememberVisitedItem(params.id);
  },
  component: ExampleDetailRoute,
});

function ExampleDetailRoute() {
  const { id } = Route.useParams();
  const { item } = useExampleItem(id);
  const { setDone, pending, error } = useExampleActions();
  return (
    // a sibling link swaps the id on this same route: the key remounts the screen, so its
    // view-local state belongs to one item
    <ExampleDetail key={id} item={item} onSetDone={(done) => setDone(id, done)} pending={pending} error={error} />
  );
}
