import { useRouter } from "expo-router";
import { useAppState } from "~/data/store";
import { useExampleItems } from "~/features/example/hooks/useExampleItems";
import { ExampleList } from "~/features/example/screens/ExampleList";
import { ScreenFailed } from "~/features/shell/components/ScreenFailed";
import { ScreenPending } from "~/features/shell/components/ScreenPending";

export default function ExampleRoute() {
  const router = useRouter();
  const facts = useExampleItems();
  // device-side state rides in as a prop like everything else: the screen never reads the store
  const { lastVisitedItemId } = useAppState();

  if (facts.status === "pending") return <ScreenPending />;
  if (facts.status === "failed") {
    return <ScreenFailed testID="example-list-failed" message={facts.failure} onRetry={facts.retry} />;
  }

  return (
    <ExampleList
      items={facts.items}
      lastVisitedId={lastVisitedItemId}
      onOpen={(id) => router.push({ pathname: "/(app)/example/[id]", params: { id } })}
    />
  );
}
