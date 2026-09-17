import type { Page } from "@playwright/test";
import { MOCK_CHECKOUT_SESSION_ID } from "../../../shared/contracts/subscription/upgrade-subscription.mock";
import { expect } from "../../fixtures/web";
import { webLocator } from "../../helpers/elements";
import { expectScreenTag } from "../../helpers/store";
import { seedNoSubscription, seedSubscription } from "../../helpers/subscription";

/**
 * The checkout return (/checkout/return) — where Stripe hands the browser back with its
 * Checkout Session id. Locators from elements/checkout-return.yaml.
 */
export class CheckoutReturnPage {
  constructor(private readonly page: Page) {}

  /** Arriving from a checkout, the way Stripe's `success_url` arrives. */
  async openFromCheckout(): Promise<void> {
    await seedNoSubscription(this.page);
    await this.page.goto(`/checkout/return?sessionId=${MOCK_CHECKOUT_SESSION_ID}`);
  }

  /** Arriving already on a plan — a reload of the return, or a bookmark. */
  async openHolding(state: "active" | "trialing"): Promise<void> {
    await seedSubscription(this.page, state);
    await this.page.goto(`/checkout/return?sessionId=${MOCK_CHECKOUT_SESSION_ID}`);
  }

  /** Arriving with no checkout to settle at all. */
  async openBare(): Promise<void> {
    await seedNoSubscription(this.page);
    await this.page.goto("/checkout/return");
  }

  async expectConfirmed(): Promise<void> {
    await expect(webLocator(this.page, "checkout_return_confirmed")).toBeVisible();
    await expect(webLocator(this.page, "checkout_return_continue")).toBeVisible();
    await expectScreenTag(this.page, "checkout-return");
  }

  async expectUnconfirmed(): Promise<void> {
    await expect(webLocator(this.page, "checkout_return_unconfirmed")).toBeVisible();
    await expect(webLocator(this.page, "checkout_return_retry")).toBeVisible();
    await expectScreenTag(this.page, "checkout-return");
  }

  /**
   * A settled return always carries its line. Which line — a trial's or a plain purchase's —
   * is copy, and copy is asserted in the screen's own spec rather than through a locator
   * that i18n would translate out from under it.
   */
  async expectNote(): Promise<void> {
    await expect(webLocator(this.page, "checkout_return_note")).toBeVisible();
  }

  async continue(): Promise<void> {
    await webLocator(this.page, "checkout_return_continue").click();
  }

  async retry(): Promise<void> {
    await webLocator(this.page, "checkout_return_retry").click();
  }
}
