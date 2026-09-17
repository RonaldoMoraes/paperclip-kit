// Reanimated runs its styles on the UI thread through a Babel-transformed worklet, which
// there is no thread for under jsdom. The stub keeps the component tree the app renders
// and drops the motion — nothing a spec asserts depends on where the pill is mid-spring.
import { type ComponentProps, type ReactNode, useEffect } from "react";
import { Image, Text as RNText, View as RNView, ScrollView } from "react-native-web";

export const useSharedValue = <T,>(value: T) => ({ value });

export const useAnimatedStyle = (): Record<string, never> => ({});

export const useAnimatedProps = (): Record<string, never> => ({});

export const withSpring = <T,>(toValue: T, _config?: unknown, _callback?: unknown) => toValue;

export const withTiming = <T,>(toValue: T, _config?: unknown, _callback?: unknown) => toValue;

export const withDelay = <T,>(_ms: number, value: T) => value;

export const withRepeat = <T,>(value: T) => value;

export const withSequence = <T,>(...values: T[]) => values[values.length - 1];

export const cancelAnimation = () => undefined;

/** The worklet seam: on the device these hop threads, here the call is already on the one. */
export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A) =>
    fn(...args);

export const Easing = {
  bezier: () => (t: number) => t,
  linear: (t: number) => t,
  ease: (t: number) => t,
  inOut: (f: (t: number) => number) => f,
  in: (f: (t: number) => number) => f,
  out: (f: (t: number) => number) => f,
};

/** Inert builders. The props carrying them are dropped below: react-native-web would hand
 *  an unknown prop straight to the DOM node. */
type Animation = {
  duration: (ms: number) => Animation;
  delay: (ms: number) => Animation;
  easing: (fn: unknown) => Animation;
  springify: () => Animation;
  damping: (value: number) => Animation;
  stiffness: (value: number) => Animation;
  mass: (value: number) => Animation;
  withInitialValues: (values: unknown) => Animation;
};

const animation = (): Animation => {
  const self: Animation = {
    duration: () => self,
    delay: () => self,
    easing: () => self,
    springify: () => self,
    damping: () => self,
    stiffness: () => self,
    mass: () => self,
    withInitialValues: () => self,
  };
  return self;
};

export const FadeIn = animation();
export const FadeInDown = animation();
export const FadeInLeft = animation();
export const FadeInRight = animation();
export const FadeOut = animation();
export const ZoomIn = animation();

export class Keyframe {
  /** Held only so `new Keyframe({...})` typechecks; the stub never plays the frames. */
  readonly definition: unknown;

  constructor(definition: unknown) {
    this.definition = definition;
  }

  duration() {
    return this;
  }
  delay() {
    return this;
  }
}

type MotionProps = {
  entering?: unknown;
  exiting?: unknown;
  layout?: unknown;
  animatedProps?: unknown;
  children?: ReactNode;
};

function View({
  entering: _e,
  exiting: _x,
  layout: _l,
  animatedProps: _a,
  ...props
}: ComponentProps<typeof RNView> & MotionProps) {
  return <RNView {...props} />;
}

function Text({
  entering: _e,
  exiting: _x,
  layout: _l,
  animatedProps: _a,
  ...props
}: ComponentProps<typeof RNText> & MotionProps) {
  return <RNText {...props} />;
}

/** Identity: the stub has no animation to attach, and a fresh wrapper type per call would
 *  remount the component it wraps. */
const createAnimatedComponent = <C,>(Component: C) => Component;

const Animated = { View, Text, Image, ScrollView, createAnimatedComponent };

export default Animated;

/** No UI thread to react on: the value is already settled, so the reaction fires on render. */
export const useAnimatedReaction = <T,>(prepare: () => T, react: (next: T, prev: T | null) => void) => {
  useEffect(() => {
    react(prepare(), null);
  });
};
