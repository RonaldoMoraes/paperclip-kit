import type { ReactNode } from "react";
import { Text, View } from "react-native";

type Props = {
  title: string;
  /** the screen's own handle for its title: `<screen>-title` */
  testID: string;
  /**
   * What this tab puts opposite the title — a `flex-row` fragment when it needs more than
   * one item. Nothing is rendered when a tab has nothing to put there.
   */
  right?: ReactNode;
};

/**
 * The top bar every tab wears: the title on the left, the tab's own content on the
 * right, and the gap to the screen's content under it.
 *
 * A component each screen renders, not a header the navigator draws — the right side is
 * data the screen owns, and a screen mounts in a spec with no navigator behind it. It
 * lives in `features/shell` because it is chrome for this app shell alone; the web has
 * its own.
 *
 * `min-h-9` is what keeps the tabs level: a slot item is 36pt, and a tab with nothing on
 * the right holds that height anyway, so its title starts where its neighbours' do.
 */
export function ScreenHeader({ title, testID, right }: Props) {
  return (
    <View className="mb-8 min-h-9 flex-row items-center justify-between">
      <Text testID={testID} className="font-sans-bold text-display-2 text-ink">
        {title}
      </Text>
      {right}
    </View>
  );
}
