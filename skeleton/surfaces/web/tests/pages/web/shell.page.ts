import type { Page } from "@playwright/test";
import { expect } from "../../fixtures/web";
import { webLocator } from "../../helpers/elements";
import { expectScreenTag, seedStore } from "../../helpers/store";

export type TabKey = "example" | "settings";

/**
 * The app shell — the floating tab bar and the materialising top bar around the
 * destinations. Locators from elements/shell.yaml.
 */
export class ShellPage {
  constructor(private readonly page: Page) {}

  async openWithSeed(path: string, seed: Record<string, unknown> | null): Promise<void> {
    await seedStore(this.page, seed);
    await this.page.goto(path);
  }

  async tapTab(tab: TabKey): Promise<void> {
    await webLocator(this.page, `tab_${tab}`).click();
  }

  async expectShell(): Promise<void> {
    await expect(webLocator(this.page, "tab_bar")).toBeVisible();
    await expect(webLocator(this.page, "top_bar")).toBeVisible();
  }

  /** The two "you are here" signals together: the pill for the eye, aria-current announced. */
  async expectActive(tab: TabKey): Promise<void> {
    await expect(webLocator(this.page, `tab_pill_${tab}`)).toBeVisible();
    await expect(webLocator(this.page, `tab_${tab}`)).toHaveAttribute("aria-current", "page");
  }

  async expectScreen(tag: string): Promise<void> {
    await expectScreenTag(this.page, tag);
  }

  /** The material is driven as inline opacity by the scroll listener; computed CSS reads it back. */
  async expectMaterialOpacity(opacity: "0" | "1"): Promise<void> {
    await expect(webLocator(this.page, "top_bar_material")).toHaveCSS("opacity", opacity);
  }
}
