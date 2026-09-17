import { fixture } from "../../../../../shared/contracts/example/list-items.mock";
import { expect, test } from "../../../../fixtures/web";
import { expectScreenTag } from "../../../../helpers/store";
import { ExamplePage } from "../../../../pages/web/example.page";
import { ShellPage } from "../../../../pages/web/shell.page";

// The seed is the one truth (`mock-library.ts`: one item done, the rest open); the item a
// journey flips and the count it lands on are derived from it, never written down.
const [first] = fixture.items;
const [firstOpen] = fixture.items.filter((item) => !item.done);
const doneCount = fixture.items.filter((item) => item.done).length;

test.describe("example-detail", () => {
  test("a deep link renders the item inside the shell, and back returns to the list", async ({ page }) => {
    // Arrange
    const example = new ExamplePage(page);
    const shell = new ShellPage(page);

    // Act — straight into the item, the way a shared link arrives
    await example.openItemWithSeed(first.id, null);

    // Assert — the item, its row's own data and flag, the list's tab still the active destination
    await example.expectDetail();
    await example.expectTitle(first.title);
    await example.expectDone(first.done);
    await shell.expectShell();
    await shell.expectActive("example");

    // Act — the way back
    await example.back();

    // Assert — and the list marks the row just opened
    await example.expectList();
    await example.expectRowLastVisited(first.id);
  });

  test("the flag survives a reload — the state lives on the server, not the tab", async ({ page }) => {
    // Arrange — an open item
    const example = new ExamplePage(page);
    await example.openItemWithSeed(firstOpen.id, null);
    await example.expectDetail();
    await example.expectDone(false);

    // Act — flip it
    await example.toggleDone();
    await example.expectDone(true);

    // Act — a fresh document
    await page.reload();

    // Assert — still done, and the list agrees: done counts one more than the seed, the row wears the mark
    await example.expectDetail();
    await example.expectDone(true);
    await example.back();
    await example.expectCount("done", doneCount + 1);
    await example.expectRowDone(firstOpen.id, true);
  });

  test("a refused write shows its line and leaves the toggle to try again", async ({ api, page }) => {
    // Arrange — the endpoint down (500), so the write fails after Query's retry-less mutation
    const example = new ExamplePage(page);
    api.mock({ [`PUT /api/example/items/${first.id}/done`]: { status: 500, json: { message: "unavailable" } } });
    await example.openItemWithSeed(first.id, null);
    await example.expectDetail();

    // Act
    await example.toggleDone();

    // Assert — the line, the flag unchanged, the button back
    await example.expectError();
    await example.expectDone(first.done);
  });

  test("an id the server does not carry goes back to the list", async ({ page }) => {
    // Arrange
    const example = new ExamplePage(page);

    // Act
    await example.openItemWithSeed("not-an-item", null);

    // Assert — the list, not an error screen
    await example.expectList();
  });

  test("a failure that is not a dead link keeps the deep link instead of bouncing to the list", async ({
    api,
    page,
  }) => {
    // Arrange — the item endpoint down (500), not missing (404)
    const example = new ExamplePage(page);
    api.mock({ [`GET /api/example/items/${first.id}`]: { status: 500, json: { message: "unavailable" } } });

    // Act — the deep link; Query retries once, so the loader settles on the second 500
    let failures = 0;
    const settled = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/example/items/${first.id}`) && response.status() === 500 && ++failures === 2
    );
    await example.openItemWithSeed(first.id, null);
    await settled;

    // Assert — the URL survives and the route's error surface is what mounted: a 500 is a
    // link worth retrying, not one to silently eat
    await expect(page).toHaveURL(new RegExp(`/example/${first.id}$`));
    await expectScreenTag(page, "route-error");
  });
});
