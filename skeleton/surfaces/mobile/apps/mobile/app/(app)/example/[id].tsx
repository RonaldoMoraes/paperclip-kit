import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useExampleActions } from "~/features/example/hooks/useExampleActions";
import { useExampleItem } from "~/features/example/hooks/useExampleItems";
import { ExampleDetail } from "~/features/example/screens/ExampleDetail";
import { ScreenFailed } from "~/features/shell/components/ScreenFailed";
import { ScreenPending } from "~/features/shell/components/ScreenPending";

export default function ExampleDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const facts = useExampleItem(id);
  const { setDone, pending, error } = useExampleActions();
  // Deep-linked here there is nothing behind this screen, and a chevron would walk the
  // user off the end of the stack: back is the list either way.
  const onBack = () => (router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)/example"));

  if (facts.status === "pending") return <ScreenPending />;
  // An id the server does not carry goes back to the list rather than to an error screen:
  // the list is the honest answer to "that one is gone".
  if (facts.status === "missing") return <Redirect href="/(app)/(tabs)/example" />;
  if (facts.status === "failed") {
    return <ScreenFailed testID="example-detail-failed" message={facts.failure} onRetry={facts.retry} />;
  }

  return (
    <ExampleDetail
      item={facts.item}
      onBack={onBack}
      onSetDone={(done) => setDone(id, done)}
      pending={pending}
      error={error}
    />
  );
}
