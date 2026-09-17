import { expect, test } from "../../../../fixtures/web";
import { CheckoutReturnPage } from "../../../../pages/web/checkout-return.page";
import { PaywallPage } from "../../../../pages/web/paywall.page";

test.describe("paywall", () => {
  test("someone who has never subscribed is offered both plans and the trial", async ({ page }) => {
    // Arrange
    const paywall = new PaywallPage(page);

    // Act
    await paywall.openUnsubscribed();

    // Assert — the annual plan is the one standing chosen, and the trial is on offer
    // because the SESSION said so; the screen derives neither
    await paywall.expectReady();
    await paywall.expectPlans("annual");
    await paywall.expectTrialOffered(true);
  });

  test("choosing a plan hands the page to Stripe and comes back settled", async ({ page }) => {
    // Arrange
    const paywall = new PaywallPage(page);
    const checkout = new CheckoutReturnPage(page);
    await paywall.openUnsubscribed();
    await paywall.expectReady();

    // Act — the whole page leaves for the checkout and returns on the success URL, which is
    // what makes the return's loader run exactly as it does against a real Stripe
    await paywall.choose("monthly");
    await paywall.submit();

    // Assert
    await checkout.expectConfirmed();
  });

  test("someone who already has a plan has no business on the wall", async ({ page }) => {
    // Arrange
    const paywall = new PaywallPage(page);

    // Act — the wall would otherwise sell a second plan the server refuses
    await paywall.openWith("active");

    // Assert — sent on to the app's first destination
    await expect(page).toHaveURL(/\/example/);
  });

  test("a plan that stopped paying is sent to billing rather than to a second checkout", async ({ page }) => {
    // Arrange
    const paywall = new PaywallPage(page);

    // Act — `past_due`: Stripe has a subscription, the person has no access
    await paywall.openWith("lapsed");

    // Assert — the trial is spent, and the card is what needs fixing
    await paywall.expectReady();
    await paywall.expectTrialOffered(false);
    await paywall.expectBillingOffered();
  });

  // The critical path keeps one keyboard-only variant.
  test("keyboard only: Tab reaches a plan and the button, Enter buys", async ({ page }) => {
    // Arrange
    const paywall = new PaywallPage(page);
    const checkout = new CheckoutReturnPage(page);
    await paywall.openUnsubscribed();
    await paywall.expectReady();

    // Act
    await paywall.tabToKey("paywall_plan_monthly");
    await paywall.pressEnter();
    await paywall.tabToKey("paywall_submit");
    await paywall.pressEnter();

    // Assert
    await checkout.expectConfirmed();
  });
});
