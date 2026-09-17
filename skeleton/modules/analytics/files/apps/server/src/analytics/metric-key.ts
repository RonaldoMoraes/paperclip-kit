import type { AnalyticsEvent } from "@contracts/analytics/events";

/**
 * The canonical dedupe key of a counted metric: the event payload serialised with its
 * keys sorted, so the same payload is the same key whatever order it was built in. It is
 * what makes the `metrics` collection's unique index `{ identifier, key }` possible.
 */
export function metricKeyOf(event: AnalyticsEvent): string {
  const record: Record<string, unknown> = event;
  const sorted = Object.keys(record)
    .sort()
    .map((field) => [field, record[field]]);
  return JSON.stringify(Object.fromEntries(sorted));
}
