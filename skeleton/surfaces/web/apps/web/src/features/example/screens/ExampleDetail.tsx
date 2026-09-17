import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import type { Item } from "@contracts/example/item";
import { EXAMPLE_COPY, fill } from "@domain/copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import { Screen } from "~/features/shell/components/Screen";
import { TAB_BAR_PAD } from "~/features/shell/components/TabBar";

/**
 * The item. Inside the list's destination on purpose: same shell, the same tab stays lit,
 * and the way back goes to the list rather than anywhere new. The one mutation — the flag —
 * is a prop the route wires to the feature hook; a refused write shows its line here and
 * the button stays, so the user can try again.
 */
type Props = {
  item: Item;
  onSetDone: (done: boolean) => void;
  pending: boolean;
  error: string | null;
};

const C = EXAMPLE_COPY.detail;

/** The date the user cares about, in their own locale. An unreadable one is simply not shown. */
function onDate(iso: string): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function ExampleDetail({ item, onSetDone, pending, error }: Props) {
  const updated = onDate(item.updatedAt);

  return (
    <Screen tag="example-detail" className={cn("px-6 pt-20", TAB_BAR_PAD)}>
      <Link
        to="/example"
        data-testid="example-detail-back"
        className="-ml-1 inline-flex items-center gap-1.5 rounded-pill py-1 pl-1 pr-3 text-sm font-semibold text-ink-secondary transition-colors duration-150 ease-brand hover:text-ink"
      >
        <ArrowLeft aria-hidden size={16} />
        {C.back}
      </Link>

      <p
        data-testid="example-detail-status"
        className={cn(
          "mt-6 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em]",
          item.done ? "bg-brand-strong text-ondark" : "border border-line bg-surface text-ink-tertiary"
        )}
      >
        {item.done ? <Check aria-hidden size={12} strokeWidth={3} /> : null}
        {item.done ? C.status.done : C.status.open}
      </p>
      <h1 data-testid="example-detail-title" className="mt-3 font-serif text-display-2 leading-[1.15] text-ink">
        {item.title}
      </h1>
      {item.note ? (
        <p data-testid="example-detail-note" className="mt-3 text-[17px] leading-relaxed text-ink-secondary">
          {item.note}
        </p>
      ) : null}
      {updated ? (
        <p
          data-testid="example-detail-updated"
          className="tnum mt-4 border-y border-line-subtle py-3 text-xs text-ink-tertiary"
        >
          {fill(C.updated, { when: updated })}
        </p>
      ) : null}

      <Button
        size="lg"
        className="mt-8 w-full"
        variant={item.done ? "card" : "primary"}
        aria-pressed={item.done}
        disabled={pending}
        data-testid="example-detail-toggle"
        onClick={() => onSetDone(!item.done)}
      >
        {item.done ? C.markOpen : C.markDone}
      </Button>
      {error ? (
        <p role="alert" data-testid="example-detail-error" className="mt-3 text-center text-sm text-error">
          {error}
        </p>
      ) : null}
    </Screen>
  );
}
