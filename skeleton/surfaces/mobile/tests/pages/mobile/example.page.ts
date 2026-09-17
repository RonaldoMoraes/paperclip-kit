import type { Browser } from "webdriverio";
import { mobileSelector } from "../../helpers/elements";

export type ExampleFilterKey = "all" | "open" | "done";

/**
 * The example feature on the phone — the list (the first tab) and the item it pushes.
 * Static locators come from the catalog's `mobile` fronts (`elements/example.yaml`,
 * resolved by `mobileSelector`); rows carry per-id testIDs the screen generates
 * (`example-list-row-<id>`), built here from the same prefix. A React Native `testID` is
 * the accessibility id on both platforms, so one selector serves iOS and Android.
 */
export class ExampleMobilePage {
  constructor(private readonly driver: Browser) {}

  private async shown(selector: string) {
    const element = this.driver.$(selector);
    await element.waitForDisplayed({ timeout: 15_000 });
    return element;
  }

  async expectList(): Promise<void> {
    await this.shown(mobileSelector("example_list_title"));
  }

  async expectDetail(): Promise<void> {
    await this.shown(mobileSelector("example_detail_title"));
  }

  /* ── filters and counts ───────────────────────────────────── */

  async tapFilter(filter: ExampleFilterKey): Promise<void> {
    await (await this.shown(mobileSelector(`example_list_filter_${filter}`))).click();
  }

  async expectCount(filter: ExampleFilterKey, count: number): Promise<void> {
    const element = await this.shown(mobileSelector(`example_list_count_${filter}`));
    await expect(element).toHaveText(String(count));
  }

  async expectEmpty(): Promise<void> {
    await this.shown(mobileSelector("example_list_empty"));
  }

  async tapEmptyCta(): Promise<void> {
    await (await this.shown(mobileSelector("example_list_empty_cta"))).click();
  }

  /* ── rows ─────────────────────────────────────────────────── */

  async openRow(id: string): Promise<void> {
    await (await this.shown(`~example-list-row-${id}`)).click();
  }

  async expectRow(id: string): Promise<void> {
    await this.shown(`~example-list-row-${id}`);
  }

  /* ── the item ─────────────────────────────────────────────── */

  async expectTitle(title: string): Promise<void> {
    const element = await this.shown(mobileSelector("example_detail_title"));
    await expect(element).toHaveText(title);
  }

  async toggleDone(): Promise<void> {
    await (await this.shown(mobileSelector("example_detail_toggle"))).click();
  }

  async expectError(): Promise<void> {
    await this.shown(mobileSelector("example_detail_error"));
  }

  async back(): Promise<void> {
    await (await this.shown(mobileSelector("example_detail_back"))).click();
  }
}
