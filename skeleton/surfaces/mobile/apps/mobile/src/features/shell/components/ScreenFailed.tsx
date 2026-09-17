import { Text, View } from "react-native";
import { SHELL_COPY } from "@domain/copy";
import { Button } from "@ui/components/Button";

type Props = {
  /** `<screen>-failed`: the route names it, so a device loop can wait on the failed state by screen */
  testID: string;
  /** the line the user reads — the hook's `failureCopy`, never a string written here */
  message: string;
  onRetry: () => void;
};

/**
 * What a route renders when its `use<Feature>Facts` hook has failed: the reason, and one
 * way to try again — the phone's `RouteError`. Generic on purpose: a feature with
 * something better to say renders a component of its own from the same branch.
 */
export function ScreenFailed({ testID, message, onRetry }: Props) {
  return (
    <View testID={testID} className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
      <Text testID={`${testID}-message`} className="text-center font-sans text-base text-ink-secondary">
        {message}
      </Text>
      <Button variant="card" onPress={onRetry} testID={`${testID}-retry`}>
        {SHELL_COPY.error.retry}
      </Button>
    </View>
  );
}
