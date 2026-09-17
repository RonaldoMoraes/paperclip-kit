import { TrackEventsRequest } from "../../../../shared/contracts/analytics/track-events";
import { expect, test } from "../../../fixtures/web";
import { ExamplePage } from "../../../pages/web/example.page";

/**
 * Smoke: the analytics door is reachable from a running app — a navigation is queued as a
 * `screen-viewed`, and backgrounding the tab sends it as one contract-valid batch to
 * `POST /api/analytics/events`. Short, real-usage surface — not a funnel.
 */
test.describe("Analytics @smoke @web", () => {
  test("a navigation then a hidden tab reaches the events endpoint as one batch", async ({ page, api }) => {
    // Arrange — the door answers as the server would; the handler would too, this pins the shape
    api.mock({ "POST /api/analytics/events": { status: 202, json: { accepted: 1 } } });
    const example = new ExamplePage(page);
    const batch = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/analytics/events"
    );

    // Act — the root redirects to the list; then the tab goes to the background
    await page.goto("/");
    await example.expectList();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Assert — one batch, the contract's shape, the list named by its route
    const body = TrackEventsRequest.parse((await batch).postDataJSON());
    expect(body.anonymousId).toBeDefined();
    expect(body.events.map((entry) => entry.event)).toContainEqual({ type: "screen-viewed", screen: "example" });
  });
});
