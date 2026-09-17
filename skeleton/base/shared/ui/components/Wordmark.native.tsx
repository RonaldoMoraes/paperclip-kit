import { Text } from "react-native";

/**
 * The platform split of Wordmark.tsx: the same plain-text mark, as a native Text. The
 * `className` reaches it through NativeWind the way every other shared component's does.
 */
export function Wordmark({ className, name = "__PRODUCT_NAME__" }: { className?: string; name?: string }) {
  return (
    <Text accessibilityRole="image" accessibilityLabel={name} testID="wordmark" className={className}>
      {name}
    </Text>
  );
}
