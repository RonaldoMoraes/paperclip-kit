import { Check, ChevronLeft, ChevronRight, Circle, ListChecks, RefreshCw, Settings } from "lucide-react-native";
import { cssInterop } from "nativewind";

/**
 * Lucide's native icons draw through react-native-svg and take a `color` prop; NativeWind
 * only rewrites `className` on the components it has been told about. `cssInterop` maps
 * the class's resolved colour onto that prop, so an icon wears a token the same way text
 * does — `className="text-ink-secondary"` — and no icon carries a hex.
 *
 * `target: false` because the class must not also land on the SVG as a style: a colour is
 * all these icons take from it. The mapping is spelled out per icon rather than through a
 * helper — `cssInterop` reads the component's own props to type the result, and a generic
 * wrapper hides them from it. A new icon is one more line here and one in
 * `test/stubs/lucideReactNative.tsx`.
 */
const COLOR_FROM_CLASS = { target: false, nativeStyleToProp: { color: true } } as const;

export const ListChecksIcon = cssInterop(ListChecks, { className: COLOR_FROM_CLASS });
export const SettingsIcon = cssInterop(Settings, { className: COLOR_FROM_CLASS });
export const ChevronLeftIcon = cssInterop(ChevronLeft, { className: COLOR_FROM_CLASS });
export const ChevronRightIcon = cssInterop(ChevronRight, { className: COLOR_FROM_CLASS });
export const CheckIcon = cssInterop(Check, { className: COLOR_FROM_CLASS });
export const CircleIcon = cssInterop(Circle, { className: COLOR_FROM_CLASS });
export const RefreshCwIcon = cssInterop(RefreshCw, { className: COLOR_FROM_CLASS });
