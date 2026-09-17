import { Pressable, ScrollView, Text, View } from "react-native";
import type { Item } from "@contracts/example/item";
import { EXAMPLE_COPY, fill } from "@domain/copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import { TAB_BAR_PAD } from "~/features/shell/components/TabBar";
import { CheckIcon, ChevronLeftIcon } from "~/lib/icons";

/**
 * The item, pushed over the list. The navigator never reaches in: back and the flag are
 * props, so the screen renders bare in its spec and under any route that hands it an
 * item. A refused write shows its line here and the button stays, so the user can try
 * again. Every handle is `example-detail-<element>`, the web's ids.
 */
type Props = {
  item: Item;
  onBack: () => void;
  onSetDone: (done: boolean) => void;
  /** the write is in flight — the button waits rather than taking a second tap */
  pending: boolean;
  /** the write was refused; the user is still here, and the button is his again */
  error: string | null;
};

const C = EXAMPLE_COPY.detail;

/** The date the user cares about, in their own locale. An unreadable one is simply not shown. */
function onDate(iso: string): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function ExampleDetail({ item, onBack, onSetDone, pending, error }: Props) {
  const updated = onDate(item.updatedAt);

  return (
    <ScrollView
      testID="example-detail"
      className="flex-1 bg-canvas"
      contentContainerClassName={`px-6 pt-16 ${TAB_BAR_PAD}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={C.back}
        testID="example-detail-back"
        onPress={onBack}
        className="-ml-2 h-11 flex-row items-center gap-1 self-start pr-3"
      >
        <ChevronLeftIcon size={20} className="text-ink-secondary" />
        <Text className="font-sans-semibold text-sm text-ink-secondary">{C.back}</Text>
      </Pressable>

      {/* The state a test asserts travels as `aria-valuetext`, never as copy. */}
      <View
        testID="example-detail-status"
        aria-valuetext={item.done ? "done" : "open"}
        className={cn(
          "mt-6 flex-row items-center gap-1.5 self-start rounded-pill px-3 py-1",
          item.done ? "bg-brand-strong" : "border border-line bg-surface"
        )}
      >
        {item.done ? <CheckIcon size={12} strokeWidth={3} className="text-ondark" /> : null}
        <Text
          className={cn("font-sans-semibold text-micro uppercase", item.done ? "text-ondark" : "text-ink-tertiary")}
        >
          {item.done ? C.status.done : C.status.open}
        </Text>
      </View>
      <Text testID="example-detail-title" className="mt-3 font-sans-bold text-display-2 text-ink">
        {item.title}
      </Text>
      {item.note ? (
        <Text testID="example-detail-note" className="mt-3 font-sans text-base text-ink-secondary">
          {item.note}
        </Text>
      ) : null}
      {updated ? (
        <Text
          testID="example-detail-updated"
          className="mt-4 border-line-subtle border-y py-3 font-sans text-xs text-ink-tertiary"
        >
          {fill(C.updated, { when: updated })}
        </Text>
      ) : null}

      <Button
        size="lg"
        className="mt-8 w-full"
        variant={item.done ? "card" : "primary"}
        disabled={pending}
        testID="example-detail-toggle"
        onPress={() => onSetDone(!item.done)}
      >
        {item.done ? C.markOpen : C.markDone}
      </Button>
      {error ? (
        <Text
          accessibilityRole="alert"
          testID="example-detail-error"
          className="mt-3 text-center font-sans text-sm text-error"
        >
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
