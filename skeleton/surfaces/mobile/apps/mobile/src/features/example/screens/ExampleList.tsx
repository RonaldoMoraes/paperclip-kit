import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Item } from "@contracts/example/item";
import { EXAMPLE_COPY } from "@domain/copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import {
  EXAMPLE_FILTERS,
  type ExampleFilter,
  filterCounts,
  itemsForFilter,
  orderItems,
} from "~/features/example/derive";
import { TAB_BAR_PAD } from "~/features/shell/components/TabBar";
import { withMarks } from "~/lib/copyMarks";
import { CheckIcon, ChevronRightIcon } from "~/lib/icons";

/**
 * The list — the golden path's first screen. Filter pills with counts, the rows under
 * them, the row the user opened last marked. Every count is derived from the rows, never
 * written down. Props in, testIDs out: nothing here fetches, and the way into an item is
 * `onOpen` — the route calls the router. Every handle is `example-list-<element>`, the
 * same ids the web's screen carries and the element catalog lists.
 */
type Props = {
  items: Item[];
  /** the item this device opened last, or null — the store's, handed in by the route */
  lastVisitedId: string | null;
  onOpen: (id: string) => void;
};

const C = EXAMPLE_COPY.list;

export function ExampleList({ items, lastVisitedId, onOpen }: Props) {
  // view-local: which pill is on — it does not survive the screen, and nothing else reads it
  const [filter, setFilter] = useState<ExampleFilter>("all");
  const counts = filterCounts(items);
  const rows = orderItems(itemsForFilter(items, filter));

  return (
    <ScrollView
      testID="example-list"
      className="flex-1 bg-canvas"
      contentContainerClassName={`px-6 pt-16 ${TAB_BAR_PAD}`}
    >
      <Text className="font-sans-medium text-sm uppercase text-ink-tertiary">{C.eyebrow}</Text>
      <Text testID="example-list-title" className="mt-1.5 font-sans-bold text-display-2 text-ink">
        {withMarks(C.title, { em: "text-ink-brand" })}
      </Text>
      <Text className="mt-2.5 font-sans text-base text-ink-secondary">{C.body}</Text>

      {/* the filters — one selection; the pill changes place rather than travelling, because a
          pill that travels needs every pill measured first, and the bar is the one place that
          earns that (TabBar) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-6 mt-8"
        contentContainerClassName="gap-2 px-6"
      >
        {EXAMPLE_FILTERS.map((id) => {
          const on = filter === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              aria-selected={on}
              testID={`example-list-filter-${id}`}
              onPress={() => setFilter(id)}
              className={cn(
                "flex-row items-center rounded-pill px-4 py-2",
                on ? "bg-brand-strong" : "border border-line bg-surface"
              )}
            >
              <Text className={cn("font-sans-semibold text-sm", on ? "text-ondark" : "text-ink-secondary")}>
                {C.filters[id]}
              </Text>
              <Text
                testID={`example-list-count-${id}`}
                className={cn("ml-1.5 font-sans text-sm", on ? "text-ondark-muted" : "text-ink-tertiary")}
              >
                {counts[id]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {rows.length === 0 ? (
        <View testID="example-list-empty" className="mt-6 items-center rounded-card border border-line bg-surface p-6">
          <Text className="font-sans-semibold text-base text-ink">{C.empty.title}</Text>
          <Text className="mt-1 text-center font-sans text-sm text-ink-secondary">{C.empty.body}</Text>
          <Button className="mt-4" onPress={() => setFilter("all")} testID="example-list-empty-cta">
            {C.emptyCta}
          </Button>
        </View>
      ) : (
        <View testID="example-list-list" className="mt-6 gap-3">
          {rows.map((item) => (
            <ItemRow key={item.id} item={item} lastVisited={item.id === lastVisitedId} onOpen={onOpen} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/* ── the row — title · note · the done mark, and the way in ── */

function ItemRow({ item, lastVisited, onOpen }: { item: Item; lastVisited: boolean; onOpen: (id: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={`example-list-row-${item.id}`}
      onPress={() => onOpen(item.id)}
      className="flex-row items-center gap-3.5 rounded-card border border-line bg-surface p-4"
    >
      <View
        className={cn(
          "h-6 w-6 items-center justify-center rounded-full border",
          item.done ? "border-transparent bg-brand-strong" : "border-line bg-surface"
        )}
      >
        {item.done ? <CheckIcon size={14} strokeWidth={3} className="text-ondark" /> : null}
      </View>
      <View className="flex-1">
        {item.done || lastVisited ? (
          <View className="flex-row items-center gap-1.5">
            {item.done ? (
              <Text
                testID={`example-list-row-done-${item.id}`}
                className="font-sans-semibold text-micro uppercase text-ink-tertiary"
              >
                {C.doneMark}
              </Text>
            ) : null}
            {lastVisited ? (
              <Text
                testID={`example-list-row-last-${item.id}`}
                className="font-sans-semibold text-micro uppercase text-ink-brand"
              >
                {C.lastVisited}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text
          numberOfLines={2}
          className={cn(
            "mt-0.5 font-sans-semibold text-base",
            item.done ? "text-ink-tertiary line-through" : "text-ink"
          )}
        >
          {item.title}
        </Text>
        {item.note ? (
          <Text numberOfLines={1} className="mt-0.5 font-sans text-sm text-ink-tertiary">
            {item.note}
          </Text>
        ) : null}
      </View>
      <ChevronRightIcon size={16} className="text-ink-tertiary" />
    </Pressable>
  );
}
