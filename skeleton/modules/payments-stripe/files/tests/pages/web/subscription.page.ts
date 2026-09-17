import type { Page } from "@playwright/test";
import { expect } from "../../fixtures/web";
import { webLocator } from "../../helpers/elements";
import { expectScreenTag } from "../../helpers/store";
import { seedNoSubscription, seedSubscription } from "../../helpers/subscription";

/**
 * The plan screen (/subscription) — the one destination behind the `_app/_paid` layout, and
 * therefore the module's proof that the layout gate turns people away.
 * Locators from elements/subscription.yaml.
 */
export class SubscriptionPage {
  constructor(private readonly page: Page) {}

  async openWith(state: "active" | "trialing" | "ending"): Promise<void> {
    await seedSubscription(this.page, state);
    await this.page.goto("/subscription");
  }

  /** A live plan bought in a phone store — shown here, managed there. */
  async openSoldElsewhere(): Promise<void> {
    await seedSubscription(this.page, "active", "revenuecat");
    await this.page.goto("/subscription");
  }

  /** Signed in, no plan — the one the layout must turn away. */
  async openUnsubscribed(): Promise<void> {
    await seedNoSubscription(this.page);
    await this.page.goto("/subscription");
  }

  async expectReady(): Promise<void> {
    await expect(webLocator(this.page, "subscription_title")).toBeVisible();
    await expect(webLocator(this.page, "subscription_plan")).toBeVisible();
    await expectScreenTag(this.page, "subscription");
  }

  async expectDatedLine(): Promise<void> {
    await expect(webLocator(this.page, "subscription_dates")).toBeVisible();
  }

  /** The plan is shown and the way to change it is somewhere else. */
  async expectManagedElsewhere(): Promise<void> {
    await expect(webLocator(this.page, "subscription_managed_elsewhere")).toBeVisible();
    await expect(webLocator(this.page, "subscription_manage_billing")).toHaveCount(0);
  }

  async expectManagedHere(): Promise<void> {
    await expect(webLocator(this.page, "subscription_manage_billing")).toBeVisible();
    await expect(webLocator(this.page, "subscription_managed_elsewhere")).toHaveCount(0);
  }

  async manageBilling(): Promise<void> {
    await webLocator(this.page, "subscription_manage_billing").click();
  }
}
