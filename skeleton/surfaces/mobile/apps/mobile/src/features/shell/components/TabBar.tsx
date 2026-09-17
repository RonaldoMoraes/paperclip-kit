import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SHELL_COPY } from "@domain/copy";
import { TAB_NAMES, type TabName } from "@domain/shell/tabs";
import { ListChecksIcon, SettingsIcon } from "~/lib/icons";
import { FLOATING_SHADOW } from "~/lib/shadow";

/**
 * The phone's half of a destination — the glyph, and nothing else. Which destinations
 * there are and in what order is `@domain/shell/tabs`, their labels `SHELL_COPY.tabs`,
 * both shared with the web's bar; keyed by `TabName`, so a destination added there is a
 * type error here until it has a face.
 */
const TAB_ICONS: Record<TabName, typeof ListChecksIcon> = {
  example: ListChecksIcon,
  settings: SettingsIcon,
};

/** the padding a tabbed screen needs so its last line does not sit under the bar */
export const TAB_BAR_PAD = "pb-32";

// Every tuned spring names its mass (`spring-mass.grit`): Reanimated fills a missing one
// with 4 and the pill settles four times slower than the web's.
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;

type Props = {
  /** undefined when the route is not a destination — the bar then highlights nothing */
  active: TabName | undefined;
  onSelect: (tab: TabName) => void;
};

/**
 * The floating bar: it sits over the screen rather than under it, in thumb reach, and the
 * active destination is a pill that travels rather than two states that blink. The bar is
 * absolutely positioned, so every tabbed screen pads its own bottom (`TAB_BAR_PAD`)
 * instead of the bar reserving a strip nothing else can use.
 */
export function TabBar({ active, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const index = active ? TAB_NAMES.indexOf(active) : -1;
  const slot = width / TAB_NAMES.length;

  // The pill is one node that moves, not one per tab: a travelling pill reads as the same
  // object changing place, which is what a spring is for.
  const pill = useAnimatedStyle(() => ({
    width: slot,
    transform: [{ translateX: withSpring(Math.max(index, 0) * slot, SPRING) }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      className="absolute inset-x-0 bottom-0 items-center px-4"
      style={{ paddingBottom: Math.max(insets.bottom, 12), pointerEvents: "box-none" }}
    >
      <View
        className="w-full max-w-md flex-row rounded-pill border border-line-subtle bg-surface p-1.5"
        style={FLOATING_SHADOW}
      >
        {active ? (
          <Animated.View
            testID={`tab-pill-${active}`}
            className="absolute bottom-1.5 top-1.5 left-1.5 rounded-pill bg-brand-strong"
            style={[pill, { pointerEvents: "none" }]}
          />
        ) : null}

        <View
          className="flex-1 flex-row"
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ pointerEvents: "box-none" }}
        >
          {TAB_NAMES.map((name) => {
            const Icon = TAB_ICONS[name];
            const label = SHELL_COPY.tabs[name];
            const on = name === active;
            return (
              <Pressable
                key={name}
                accessibilityRole="tab"
                aria-selected={on}
                accessibilityLabel={label}
                testID={`tab-${name}`}
                onPress={() => onSelect(name)}
                className="flex-1 items-center justify-center gap-0.5 rounded-pill py-2"
              >
                <Icon size={19} strokeWidth={on ? 2.2 : 1.8} className={on ? "text-ondark" : "text-ink-secondary"} />
                {/* Spans the tab: a self-sized bold label is measured short on Android and clips. */}
                <Text
                  className={`w-full font-sans-bold text-micro text-center ${on ? "text-ondark" : "text-ink-secondary"}`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
