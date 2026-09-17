import { describe, expect, it } from "vitest";
import type { AnalyticsEvent } from "@contracts/analytics/events";
import { metricKeyOf } from "./metric-key";

describe("metricKeyOf", () => {
  it("is independent of key insertion order", () => {
    const built: AnalyticsEvent = { type: "action", screen: "example-detail", action: "mark-done" };
    const parsed: AnalyticsEvent = JSON.parse('{"action":"mark-done","screen":"example-detail","type":"action"}');
    expect(metricKeyOf(built)).toBe(metricKeyOf(parsed));
  });

  it("distinguishes payloads that differ in one field, and types with equal fields", () => {
    expect(metricKeyOf({ type: "friction", screen: "example", kind: "retry" })).not.toBe(
      metricKeyOf({ type: "friction", screen: "example", kind: "backout" })
    );
    expect(metricKeyOf({ type: "screen-viewed", screen: "example" })).not.toBe(
      metricKeyOf({ type: "choice", screen: "example", choice: "example" })
    );
  });
});
