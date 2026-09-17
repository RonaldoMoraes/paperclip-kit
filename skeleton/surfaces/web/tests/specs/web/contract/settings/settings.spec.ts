import { test } from "../../../../fixtures/web";
import { SettingsPage } from "../../../../pages/web/settings.page";
import { ShellPage } from "../../../../pages/web/shell.page";

test.describe("settings", () => {
  test("stands in the shell with the version, and says what there is to manage", async ({ page }) => {
    // Arrange
    const settings = new SettingsPage(page);
    const shell = new ShellPage(page);

    // Act
    await settings.openWithSeed(null);

    // Assert — what holds whatever is installed: the screen, the version, and a card that
    // carries either the modules' rows or the line that says there are none. How many rows
    // is the contributing module's claim, in its own spec, not base's.
    await settings.expectReady();
    await shell.expectShell();
    await shell.expectActive("settings");
    await settings.expectVersion();
    await settings.expectSomethingToManage();
  });

  test("is one tap from the list, and the pill follows", async ({ page }) => {
    // Arrange
    const settings = new SettingsPage(page);
    const shell = new ShellPage(page);
    await shell.openWithSeed("/example", null);
    await shell.expectScreen("example-list");

    // Act
    await shell.tapTab("settings");

    // Assert
    await settings.expectReady();
    await shell.expectActive("settings");
  });
});
