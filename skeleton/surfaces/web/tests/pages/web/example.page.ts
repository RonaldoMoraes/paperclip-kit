import type { Locator, Page } from "@playwright/test";
import { expect } from "../../fixtures/web";
import { webLocator } from "../../helpers/elements";
import { expectScreenTag, seedStore } from "../../helpers/store";

export type ExampleFilterKey = "all" | "open" | "done";

/**
 * The example feature (/example and /example/<id>) — the list and the item. Static
 * locators from elements/example.yaml; rows carry per-id testids the screen generates
 * (`example-list-row-<id>`), built here from the same prefix.
 */
export class ExamplePage {
  constructor(private readonly page: Page) {}

  async openListWithSeed(seed: Record<string, unknown> | null): Promise<void> {
    await seedStore(this.page, seed);
    await this.page.goto("/example");
  }

  async openItemWithSeed(id: string, seed: Record<string, unknown> | null): Promise<void> {
    await seedStore(this.page, seed);
    await this.page.goto(`/example/${id}`);
  }

  async expectList(): Promise<void> {
    await expectScreenTag(this.page, "example-list");
  }

  async expectDetail(): Promise<void> {
    await expectScreenTag(this.page, "example-detail");
  }

  /* ── filters and counts ───────────────────────────────────── */

  async tapFilter(filter: ExampleFilterKey): Promise<void> {
    await webLocator(this.page, `example_list_filter_${filter}`).click();
  }

  async expectCount(filter: ExampleFilterKey, count: number): Promise<void> {
    await expect(webLocator(this.page, `example_list_count_${filter}`)).toHaveText(String(count));
  }

  async expectEmpty(): Promise<void> {
    await expect(webLocator(this.page, "example_list_empty")).toBeVisible();
  }

  async tapEmptyCta(): Promise<void> {
    await webLocator(this.page, "example_list_empty_cta").click();
  }

  /* ── rows ─────────────────────────────────────────────────── */

  row(id: string): Locator {
    return this.page.getByTestId(`example-list-row-${id}`);
  }

  async openRow(id: string): Promise<void> {
    await this.row(id).click();
  }

  async expectRow(id: string): Promise<void> {
    await expect(this.row(id)).toBeVisible();
  }

  async expectNoRow(id: string): Promise<void> {
    await expect(this.row(id)).toHaveCount(0);
  }

  async expectRowDone(id: string, done: boolean): Promise<void> {
    await expect(this.page.getByTestId(`example-list-row-done-${id}`)).toHaveCount(done ? 1 : 0);
  }

  async expectRowLastVisited(id: string): Promise<void> {
    await expect(this.page.getByTestId(`example-list-row-last-${id}`)).toBeVisible();
  }

  /* ── the item ─────────────────────────────────────────────── */

  async expectTitle(title: string): Promise<void> {
    await expect(webLocator(this.page, "example_detail_title")).toHaveText(title);
  }

  async expectDone(done: boolean): Promise<void> {
    await expect(webLocator(this.page, "example_detail_toggle")).toHaveAttribute("aria-pressed", String(done));
  }

  async toggleDone(): Promise<void> {
    await webLocator(this.page, "example_detail_toggle").click();
  }

  async expectError(): Promise<void> {
    await expect(webLocator(this.page, "example_detail_error")).toBeVisible();
  }

  async back(): Promise<void> {
    await webLocator(this.page, "example_detail_back").click();
  }

  /* ── keyboard ─────────────────────────────────────────────── */

  /** Tab until the locator holds focus — the keyboard-only journey's one move. */
  async tabTo(target: Locator, limit = 30): Promise<void> {
    for (let presses = 0; presses < limit; presses += 1) {
      await this.page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    }
    throw new Error(`Tab never reached the target within ${limit} presses`);
  }

  /** Tab until the catalog key holds focus. */
  async tabToKey(key: string, limit = 30): Promise<void> {
    await this.tabTo(webLocator(this.page, key), limit);
  }

  async pressEnter(): Promise<void> {
    await this.page.keyboard.press("Enter");
  }
}
