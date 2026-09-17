import type { Locator, Page } from "@playwright/test";
import type { PlanName } from "../../../shared/contracts/subscription/checkout";
import { expect } from "../../fixtures/web";
import { webLocator } from "../../helpers/elements";
import { expectScreenTag } from "../../helpers/store";
import { seedNoSubscription, seedSubscription } from "../../helpers/subscription";

/**
 * The paywall (/paywall) — what is sold, and the one hand-off to Stripe. Locators from
 * elements/paywall.yaml; the entitlement is seeded through helpers/subscription.ts.
 */
export class PaywallPage {
  constructor(private readonly page: Page) {}

  /** Signed in, never subscribed — the state the wall exists for. */
  async openUnsubscribed(): Promise<void> {
    await seedNoSubscription(this.page);
    await this.page.goto("/paywall");
  }

  /** Signed in with a plan on record, paying or not. */
  async openWith(state: "active" | "lapsed"): Promise<void> {
    await seedSubscription(this.page, state);
    await this.page.goto("/paywall");
  }

  async expectReady(): Promise<void> {
    await expect(webLocator(this.page, "paywall_title")).toBeVisible();
    await expect(webLocator(this.page, "paywall_submit")).toBeVisible();
    await expectScreenTag(this.page, "paywall");
  }

  /** Both plans stand, and one of them is the one that will be bought. */
  async expectPlans(chosen: PlanName): Promise<void> {
    await expect(webLocator(this.page, "paywall_plan_monthly")).toBeVisible();
    await expect(webLocator(this.page, "paywall_plan_annual")).toBeVisible();
    await expect(webLocator(this.page, `paywall_plan_${chosen}`)).toHaveAttribute("aria-pressed", "true");
  }

  async expectTrialOffered(offered: boolean): Promise<void> {
    await expect(webLocator(this.page, "paywall_trial")).toHaveCount(offered ? 1 : 0);
  }

  /** A plan on record that stopped paying: the billing portal, not a second checkout. */
  async expectBillingOffered(): Promise<void> {
    await expect(webLocator(this.page, "paywall_lapsed")).toBeVisible();
    await expect(webLocator(this.page, "paywall_manage_billing")).toBeVisible();
  }

  async choose(plan: PlanName): Promise<void> {
    await webLocator(this.page, `paywall_plan_${plan}`).click();
  }

  async submit(): Promise<void> {
    await webLocator(this.page, "paywall_submit").click();
  }

  async expectErrorVisible(): Promise<void> {
    await expect(webLocator(this.page, "paywall_error")).toBeVisible();
    await expectScreenTag(this.page, "paywall");
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

  async tabToKey(key: string, limit = 30): Promise<void> {
    await this.tabTo(webLocator(this.page, key), limit);
  }

  async pressEnter(): Promise<void> {
    await this.page.keyboard.press("Enter");
  }
}
