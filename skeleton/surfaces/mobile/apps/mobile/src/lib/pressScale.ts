import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { TAP } from "@ui/motion-tokens";
import { EASE } from "./motion";

/**
 * A control shrinking under the thumb, as motion rather than as a `Pressable` function
 * `style`: the web's pressed state is a 150 ms transform transition, a function `style`
 * would snap straight to the pressed scale and back, and it would sit beside NativeWind's
 * `className` on the same node in a way this app has not verified.
 *
 * `style` is the ready-made animated style; `scale` is the same value for a caller that
 * already has a `useAnimatedStyle` of its own and must not add a second one to the node.
 */
export function usePressScale() {
  const scale = useSharedValue(1);

  const press = (to: number) => {
    scale.value = withTiming(to, { duration: TAP.durationMs, easing: EASE });
  };

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return {
    onPressIn: () => press(TAP.scale),
    onPressOut: () => press(1),
    scale,
    style,
  };
}
