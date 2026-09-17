import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { Item } from "@contracts/example/item";
import { EXAMPLE_COPY } from "@domain/copy";
import { cn } from "@ui/cn";
import {
  EXAMPLE_FILTERS,
  type ExampleFilter,
  filterCounts,
  itemsForFilter,
  orderItems,
} from "~/features/example/derive";
import { Screen } from "~/features/shell/components/Screen";
import { TAB_BAR_PAD } from "~/features/shell/components/TabBar";
import { withMarks } from "~/lib/copyMarks";
import { SPRING } from "~/lib/motion";

/**
 * The list — the golden path's first screen. Filter pills with counts, the rows under
 * them, the row the user opened last marked. Every count is derived from the rows, never
 * written down. Props in, testids out: nothing here fetches.
 */
type Props = {
  items: Item[];
  /** the item this device opened last, or null — the store's, handed in by the route */
  lastVisitedId: string | null;
};

const C = EXAMPLE_COPY.list;

export function ExampleList({ items, lastVisitedId }: Props) {
  // view-local: which pill is on — it does not survive the screen, and nothing else reads it
  const [filter, setFilter] = useState<ExampleFilter>("all");
  const counts = filterCounts(items);
  const rows = orderItems(itemsForFilter(items, filter));

  return (
    <Screen tag="example-list" className={cn("px-6 pt-20", TAB_BAR_PAD)}>
      <p className="text-sm font-medium uppercase tracking-[0.06em] text-ink-tertiary">{C.eyebrow}</p>
      <h1 data-testid="example-list-title" className="mt-1.5 font-serif text-display-2 text-ink">
        {withMarks(C.title, { em: "italic text-ink-brand" })}
      </h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-secondary">{C.body}</p>

      {/* the filters — one selection, and the pill travels with it */}
      <div className="-mx-6 mt-8 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {EXAMPLE_FILTERS.map((id) => {
            const on = filter === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`example-list-filter-${id}`}
                aria-pressed={on}
                onClick={() => setFilter(id)}
                className="relative shrink-0 rounded-pill px-4 py-2 text-sm font-semibold"
              >
                {on ? (
                  <motion.span
                    aria-hidden
                    layoutId="example-filter-pill"
                    transition={SPRING}
                    className="absolute inset-0 rounded-pill bg-brand-strong shadow-soft"
                  />
                ) : (
                  <span aria-hidden className="absolute inset-0 rounded-pill border border-line bg-surface" />
                )}
                <span className={cn("relative", on ? "text-ondark" : "text-ink-secondary")}>
                  {C.filters[id]}
                  <span
                    data-testid={`example-list-count-${id}`}
                    className={cn("tnum ml-1.5", on ? "text-ondark-muted" : "text-ink-tertiary")}
                  >
                    {counts[id]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="mt-6">
        {rows.length === 0 ? (
          <div data-testid="example-list-empty" className="card rounded-card p-6 text-center">
            <p className="text-[15px] font-semibold text-ink">{C.empty.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{C.empty.body}</p>
            <button
              type="button"
              data-testid="example-list-empty-cta"
              onClick={() => setFilter("all")}
              className="mt-4 rounded-pill bg-brand-strong px-4 py-2 text-sm font-semibold text-ondark shadow-soft"
            >
              {C.emptyCta}
            </button>
          </div>
        ) : (
          <div data-testid="example-list-list" className="flex flex-col gap-3">
            {rows.map((item) => (
              <ItemRow key={item.id} item={item} lastVisited={item.id === lastVisitedId} />
            ))}
          </div>
        )}
      </section>
    </Screen>
  );
}

/* ── the row — title · note · the done mark, and the way in ── */

function ItemRow({ item, lastVisited }: { item: Item; lastVisited: boolean }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      data-testid={`example-list-row-${item.id}`}
      onClick={() => navigate({ to: "/example/$id", params: { id: item.id } })}
      className="card flex w-full min-w-0 items-center gap-3.5 rounded-card p-4 text-left"
    >
      <span
        aria-hidden
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          item.done ? "border-transparent bg-brand-strong text-ondark" : "border-line bg-surface"
        )}
      >
        {item.done ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      <span className="block min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
          {item.done ? <span data-testid={`example-list-row-done-${item.id}`}>{C.doneMark}</span> : null}
          {lastVisited ? (
            <span data-testid={`example-list-row-last-${item.id}`} className="text-ink-brand">
              {C.lastVisited}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "mt-0.5 line-clamp-2 block text-[15px] font-semibold leading-snug",
            item.done ? "text-ink-tertiary line-through" : "text-ink"
          )}
        >
          {item.title}
        </span>
        {item.note ? (
          <span className="mt-0.5 line-clamp-1 block text-[13px] leading-snug text-ink-tertiary">{item.note}</span>
        ) : null}
      </span>
      <ChevronRight aria-hidden size={16} className="shrink-0 text-ink-tertiary" />
    </button>
  );
}
