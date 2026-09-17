// Deliberate violation for the lint-guard canary: springs tuned by hand without a mass.
import Animated, { ZoomIn, withSpring } from "react-native-reanimated";

const T = { stiffness: 500, damping: 24, mass: 1 } as const;

export const chain = <Animated.View entering={ZoomIn.springify().stiffness(T.stiffness).damping(T.damping)} />;
export const config = withSpring(1, { stiffness: 500, damping: 24 });
