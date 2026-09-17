import { describe, expect, it } from "vitest";
import { AnalyticsEvent } from "./events";

/** One valid instance of every event in the vocabulary — the union's living catalog. */
const validEvents: AnalyticsEvent[] = [
  { type: "source", source: "ad" },
  { type: "session", durationInS: 92.5 },
  { type: "screen-viewed", screen: "example-list" },
  { type: "action", screen: "example-detail", action: "mark-done" },
  { type: "funnel", flow: "onboarding", step: "welcome", outcome: "enter" },
  { type: "funnel", flow: "onboarding", step: "welcome", outcome: "abandon" },
  { type: "choice", screen: "example-list", choice: "done" },
  { type: "friction", screen: "example-detail", kind: "retry" },
  { type: "data-exported" },
  { type: "account-deleted" },
];

describe("the catalog above covers the vocabulary", () => {
  it("carries an instance of every event in the union", () => {
    // Without this, a new event joins the union and nothing above it is ever exercised.
    const inUnion = AnalyticsEvent.options.map((option) => option.shape.type.value);
    expect([...new Set(validEvents.map((event) => event.type))].sort()).toEqual([...inUnion].sort());
  });
});

describe("AnalyticsEvent", () => {
  it.each(validEvents)("accepts %j", (event) => {
    expect(AnalyticsEvent.parse(event)).toEqual(event);
  });

  it("rejects an unknown type", () => {
    expect(AnalyticsEvent.safeParse({ type: "page-view", path: "/home" }).success).toBe(false);
  });

  describe("PHI-shaped payloads are rejected", () => {
    // Every string field is a slug: prose, a sentence the user typed, a URL — none parses.
    it("a screen or an action is an id, never prose", () => {
      expect(AnalyticsEvent.safeParse({ type: "screen-viewed", screen: "How often do you sleep?" }).success).toBe(
        false
      );
      expect(AnalyticsEvent.safeParse({ type: "action", screen: "example", action: "typed hello" }).success).toBe(
        false
      );
      expect(AnalyticsEvent.safeParse({ type: "screen-viewed", screen: "/example/first-thing" }).success).toBe(false);
    });

    it("a choice is the option's id, never its label or what was typed", () => {
      expect(
        AnalyticsEvent.safeParse({ type: "choice", screen: "example", choice: "I want the calm one please" }).success
      ).toBe(false);
    });

    it("a funnel outcome and a friction kind are closed lists", () => {
      expect(
        AnalyticsEvent.safeParse({ type: "funnel", flow: "onboarding", step: "welcome", outcome: "gave up" }).success
      ).toBe(false);
      expect(AnalyticsEvent.safeParse({ type: "friction", screen: "example", kind: "Invalid email" }).success).toBe(
        false
      );
    });

    it("a source is a channel class, not the referrer", () => {
      expect(AnalyticsEvent.safeParse({ type: "source", source: "https://example.com/?utm=x" }).success).toBe(false);
    });

    it("a slug longer than 64 characters is rejected", () => {
      const long = `step-${"a".repeat(64)}`;
      expect(AnalyticsEvent.safeParse({ type: "screen-viewed", screen: long }).success).toBe(false);
    });

    // Zod strips unknown keys rather than failing, so the claim is on what the parse
    // result carries: a value smuggled onto a known event must not survive it.
    it("a field the event does not declare is dropped by the parse", () => {
      const smuggled = { type: "action", screen: "example", action: "mark-done", note: "his own words", score: 71 };
      const parsed = AnalyticsEvent.parse(smuggled);
      expect(parsed).not.toHaveProperty("note");
      expect(parsed).not.toHaveProperty("score");
    });

    // The two data-rights events are bare because the thing they are about is the whole
    // record. Anything hung off them would outlive the rows the user asked to have deleted.
    it("the data-rights events never carry what the file held or what was destroyed", () => {
      expect(AnalyticsEvent.parse({ type: "data-exported", rows: 84, email: "them@example.com" })).toEqual({
        type: "data-exported",
      });
      expect(AnalyticsEvent.parse({ type: "account-deleted", rowsDeleted: 312 })).toEqual({ type: "account-deleted" });
    });
  });
});
