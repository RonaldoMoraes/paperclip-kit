import { fixture } from "../../../../shared/contracts/example/list-items.mock";
import { test } from "../../../fixtures/web";
import { ExamplePage } from "../../../pages/web/example.page";

/**
 * Smoke: open the app and see the list — title, a row per item, a count that agrees.
 * Short, real-usage surface — not a full journey.
 */
test.describe("Example @smoke @web", () => {
  test("opens on the list with its rows", async ({ page }) => {
    // Arrange
    const example = new ExamplePage(page);

    // Act — the root redirects to the first destination
    await page.goto("/");

    // Assert
    await example.expectList();
    await example.expectCount("all", fixture.items.length);
    await example.expectRow(fixture.items[0].id);
  });
});
