// The real package reaches into react-native's Flow-typed internals, which esbuild
// cannot parse. jsdom has no notches: zero insets, SafeAreaView is a plain View.
import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native-web";

export type Edge = "top" | "right" | "bottom" | "left";

export type EdgeInsets = { top: number; right: number; bottom: number; left: number };

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const FRAME = { x: 0, y: 0, width: 390, height: 844 };

export const initialWindowMetrics = { frame: FRAME, insets: ZERO_INSETS };

export function useSafeAreaInsets(): EdgeInsets {
  return ZERO_INSETS;
}

export function SafeAreaProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SafeAreaView({ edges: _edges, ...props }: ComponentProps<typeof View> & { edges?: readonly Edge[] }) {
  return <View {...props} />;
}
