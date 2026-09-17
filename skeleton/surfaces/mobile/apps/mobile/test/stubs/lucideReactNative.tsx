// The real icons draw through react-native-svg, which needs a native canvas. Specs assert
// what the user can reach — the pressable and its label — never the glyph, so an icon is a
// node with its name on it. One line per icon `src/lib/icons.ts` registers.
import { View } from "react-native-web";

type IconProps = { size?: number | string; strokeWidth?: number; color?: string; className?: string };

const icon = (name: string) =>
  function Icon({ size: _size, strokeWidth: _strokeWidth, color: _color, ...props }: IconProps) {
    return <View testID={`icon-${name}`} {...props} />;
  };

export const ListChecks = icon("list-checks");
export const Settings = icon("settings");
export const ChevronLeft = icon("chevron-left");
export const ChevronRight = icon("chevron-right");
export const Check = icon("check");
export const Circle = icon("circle");
export const RefreshCw = icon("refresh-cw");
