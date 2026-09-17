import { useSegments } from "expo-router";
import { useEffect } from "react";
import { screenSlug } from "@contracts/analytics/screen-slug";
import { useAnalytics } from "~/lib/analytics";

/**
 * Every screen the navigator lands on is one `screen-viewed`, named the way the web names
 * it: from the route's own segments (`(app)`, `example`, `[id]` → `example-id`,
 * `screen-slug.ts`), never from the URL — a parameter's value is a fact about one user and
 * no event carries it. The index route is where the gates decide, not a screen: no
 * segments, no event. Returns nothing; the view has nothing to read.
 */
export function useScreenViews(): void {
  const { track } = useAnalytics();
  // Widened: with typed routes the navigator answers a tuple union, and the index route's
  // empty list is a length no tuple in it has.
  const segments: readonly string[] = useSegments();
  const screen = segments.length === 0 ? null : screenSlug(segments);

  useEffect(() => {
    if (screen !== null) track({ type: "screen-viewed", screen });
  }, [screen, track]);
}
