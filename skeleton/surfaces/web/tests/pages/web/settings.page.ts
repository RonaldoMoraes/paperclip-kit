import type { Page } from "@playwright/test";
import { expect } from "../../fixtures/web";
import { webLocator } from "../../helpers/elements";
import { expectScreenTag, seedStore } from "../../helpers/store";

/** Settings (/settings) — the modules' rows and the version. Locators from elements/settings.yaml. */
export class SettingsPage {
  constructor(private readonly page: Page) {}

  async openWithSeed(seed: Record<string, unknown> | null): Promise<void> {
    await seedStore(this.page, seed);
    await this.page.goto("/settings");
  }

  async expectReady(): Promise<void> {
    await expect(webLocator(this.page, "settings_title")).toBeVisible();
    await expectScreenTag(this.page, "settings");
  }

  async expectVersion(): Promise<void> {
    // a version, not the placeholder a bare import would leave
    await expect(webLocator(this.page, "settings_version")).toContainText(/\d+\.\d+\.\d+/);
  }

  /**
   * What Settings says whatever is installed: the card stands, carrying either the
   * modules' rows or the line that says there are none. Base reads the second way; a
   * module's row lands as `settings-action-<id>`. The count is a module's own claim
   * (`expectActionCount`), not something base can assert.
   */
  async expectSomethingToManage(): Promise<void> {
    await expect(webLocator(this.page, "settings_actions")).toBeVisible();
    const rows = webLocator(this.page, "settings_action_rows");
    const nothing = webLocator(this.page, "settings_no_actions");
    await expect(rows.or(nothing).first()).toBeVisible();
  }

  /** How many module rows stand on the screen — base ships none and says so. */
  async expectActionCount(count: number): Promise<void> {
    await expect(webLocator(this.page, "settings_actions")).toBeVisible();
    await expect(webLocator(this.page, "settings_action_rows")).toHaveCount(count);
    await expect(webLocator(this.page, "settings_no_actions")).toHaveCount(count === 0 ? 1 : 0);
  }

  async tapAction(id: string): Promise<void> {
    await this.page.getByTestId(`settings-action-${id}`).click();
  }
}
