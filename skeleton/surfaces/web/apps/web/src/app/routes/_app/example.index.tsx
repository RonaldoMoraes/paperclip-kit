import { createFileRoute } from "@tanstack/react-router";
import { listItemsQuery } from "@contracts/example/list-items";
import { useAppState } from "~/data/store";
import { useExampleItems } from "~/features/example/hooks/useExampleItems";
import { ExampleList } from "~/features/example/screens/ExampleList";
import { http } from "~/lib/http";

/**
 * The list loads whole through the contract's query, so the screen never renders a loading
 * branch; the hook then reads the same query live, so a flag flipped on the detail page
 * moves the counts here when the user comes back.
 */
export const Route = createFileRoute("/_app/example/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listItemsQuery(http)),
  component: ExampleListRoute,
});

function ExampleListRoute() {
  const { items } = useExampleItems();
  // device-side state rides in as a prop like everything else: the screen never reads the store
  const { lastVisitedItemId } = useAppState();
  return <ExampleList items={items} lastVisitedId={lastVisitedItemId} />;
}
