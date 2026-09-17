import { Link, useRouterState } from "@tanstack/react-router";
import { ListChecks, type LucideIcon, Settings } from "lucide-react";
import { motion } from "motion/react";
import { SHELL_COPY } from "@domain/copy";
import { TAB_DESTINATIONS, TAB_NAMES, type TabName } from "@domain/shell/tabs";
import { cn } from "@ui/cn";
import { SPRING } from "~/lib/motion";

/** the icon per destination — the names and their order are the domain's (`@domain/shell/tabs`) */
const ICONS: Record<TabName, LucideIcon> = { example: ListChecks, settings: Settings };

/** the bottom padding every shelled screen reserves so nothing hides behind the bar (safe area + 6rem) */
export const TAB_BAR_PAD = "pb-tab-clear";

/**
 * One layout id, shared by the pill wherever it renders: motion animates it as the same
 * object changing place, so the pill travels between destinations rather than cutting.
 */
const PILL_LAYOUT_ID = "tab-pill";

/** Which destination a path lights. A detail page is inside its list, so prefixes count. */
export function activeTab(pathname: string): TabName | undefined {
  return TAB_NAMES.find((name) => {
    const to = TAB_DESTINATIONS[name];
    return pathname === to || pathname.startsWith(`${to}/`);
  });
}

/**
 * The floating bar: fixed over the content in thumb reach, above the safe area, never a
 * solid strip — `.chrome` only works because the page passes under it, which is what
 * `TAB_BAR_PAD` on the screens preserves. The bar itself stays quiet: the travelling pill
 * is its only strong mark.
 */
export function TabBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = activeTab(pathname);

  return (
    <nav
      aria-label="Primary"
      data-testid="tab-bar"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-bar-lift"
    >
      <div className="chrome pointer-events-auto flex w-full max-w-md rounded-pill p-1.5">
        {TAB_NAMES.map((name) => {
          const on = name === active;
          const Icon = ICONS[name];
          return (
            <Link
              key={name}
              to={TAB_DESTINATIONS[name]}
              data-testid={`tab-${name}`}
              aria-current={on ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-pill py-2"
            >
              {on ? (
                <motion.span
                  aria-hidden
                  layoutId={PILL_LAYOUT_ID}
                  // jsdom cannot see the travel; the shared id is the mechanism, so it is
                  // mirrored into the DOM for the unit spec to pin.
                  data-layout-id={PILL_LAYOUT_ID}
                  data-testid={`tab-pill-${name}`}
                  transition={SPRING}
                  className="absolute inset-0 rounded-pill bg-brand-strong"
                />
              ) : null}
              <Icon
                aria-hidden
                size={19}
                strokeWidth={on ? 2.2 : 1.8}
                className={cn("relative", on ? "text-ondark" : "text-ink-secondary")}
              />
              {/* Spans the tab so the label centres on the slot, not on its own width. */}
              <span
                className={cn(
                  "relative w-full text-center font-medium text-micro",
                  on ? "text-ondark" : "text-ink-secondary"
                )}
              >
                {SHELL_COPY.tabs[name]}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
