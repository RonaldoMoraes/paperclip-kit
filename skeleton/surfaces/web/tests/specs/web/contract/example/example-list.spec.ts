import { visitedSeed } from "../../../../../apps/web/src/testing/seeds";
import { fixture } from "../../../../../shared/contracts/example/list-items.mock";
import { test } from "../../../../fixtures/web";
import { ExamplePage } from "../../../../pages/web/example.page";
import { ShellPage } from "../../../../pages/web/shell.page";

// The seed is the one truth (`mock-library.ts`: one item done, the rest open); counts and
// the item a journey flips are derived from it, never written down.
const [, second] = fixture.items;
const open = fixture.items.filter((item) => !item.done);
const done = fixture.items.filter((item) => item.done);
const [firstOpen] = open;

test.describe("example-list", () => {
  test("the list stands in the shell and every count is derived from the rows", async ({ page }) => {
    // Arrange
    const example = new ExamplePage(page);
    const shell = new ShellPage(page);

    // Act
    await example.openListWithSeed(null);

    // Assert — the shell around it, the list's tab lit, counts and marks matching the seed
    await example.expectList();
    await shell.expectShell();
    await shell.expectActive("example");
    await example.expectCount("all", fixture.items.length);
    await example.expectCount("open", open.length);
    await example.expectCount("done", done.length);
    for (const item of fixture.items) await example.expectRow(item.id);
    for (const item of fixture.items) await example.expectRowDone(item.id, item.done);
  });

  test("an empty filter explains itself and offers the way back", async ({ api, page }) => {
    // Arrange — a library with nothing done, so the done pill has nothing to show
    const example = new ExamplePage(page);
    api.mock({ "GET /api/example/items": { json: { items: open } } });
    await example.openListWithSeed(null);
    await example.expectList();

    // Act
    await example.tapFilter("done");

    // Assert
    await example.expectEmpty();
    await example.tapEmptyCta();
    await example.expectRow(firstOpen.id);
  });

  test("marks the row this device opened last — the store's, seeded as a returning browser carries it", async ({
    page,
  }) => {
    // Arrange
    const example = new ExamplePage(page);

    // Act
    await example.openListWithSeed(visitedSeed(second.id) as Record<string, unknown>);

    // Assert
    await example.expectList();
    await example.expectRowLastVisited(second.id);
  });

  // The journey's keyboard-only variant: a row reached and opened, the flag flipped — Tab
  // and Enter the whole way, locating by testid as ever.
  test("keyboard only: Tab reaches a row, Enter opens it, and the toggle flips", async ({ page }) => {
    // Arrange
    const example = new ExamplePage(page);
    const shell = new ShellPage(page);
    await example.openListWithSeed(null);
    await example.expectList();

    // Act — into an open item with the keyboard alone
    await example.tabTo(example.row(firstOpen.id));
    await example.pressEnter();

    // Assert — the item is on stage, still inside the list's tab
    await example.expectDetail();
    await shell.expectActive("example");

    // Act — flip it with the keyboard alone
    await example.tabToKey("example_detail_toggle");
    await example.pressEnter();

    // Assert
    await example.expectDone(true);
  });
});
