import { expect, test } from "../../../../fixtures/web";
import { PaywallPage } from "../../../../pages/web/paywall.page";
import { SettingsPage } from "../../../../pages/web/settings.page";
import { SubscriptionPage } from "../../../../pages/web/subscription.page";

test.describe("subscription", () => {
  test("a subscriber sees what they hold and when it renews", async ({ page }) => {
    // Arrange
    const plan = new SubscriptionPage(page);

    // Act
    await plan.openWith("active");

    // Assert — every line came off the session; nothing here asked Stripe
    await plan.expectReady();
    await plan.expectDatedLine();
  });

  // The whole point of the `_app/_paid` layout: the entitlement is read off the session in
  // `beforeLoad`, so the decision is made before anything renders.
  test("the entitlement layout turns away someone with no plan", async ({ page }) => {
    // Arrange
    const plan = new SubscriptionPage(page);
    const paywall = new PaywallPage(page);

    // Act — straight at a destination behind the layout
    await plan.openUnsubscribed();

    // Assert
    await paywall.expectReady();
    await expect(page).toHaveURL(/\/paywall/);
  });

  test("a plan on its way out is dated by its ending, not by a renewal", async ({ page }) => {
    // Arrange — the shape the billing portal leaves: a scheduled stop, the flag still false
    const plan = new SubscriptionPage(page);

    // Act
    await plan.openWith("ending");

    // Assert
    await plan.expectReady();
    await plan.expectDatedLine();
  });

  // One table, every seller: `provider` is the column that says which one, and it is what
  // keeps a store buyer away from a Stripe portal that would refuse — or open the wrong
  // account.
  test("a plan bought in a store is shown here and managed there", async ({ page }) => {
    // Arrange
    const plan = new SubscriptionPage(page);

    // Act
    await plan.openSoldElsewhere();

    // Assert
    await plan.expectReady();
    await plan.expectManagedElsewhere();
  });

  test("a plan bought here keeps its way to the billing portal", async ({ page }) => {
    // Arrange
    const plan = new SubscriptionPage(page);

    // Act
    await plan.openWith("active");

    // Assert
    await plan.expectManagedHere();
  });

  test("Settings leads here", async ({ page }) => {
    // Arrange
    const settings = new SettingsPage(page);
    const plan = new SubscriptionPage(page);
    await plan.openWith("active");
    await page.goto("/settings");
    await settings.expectReady();

    // Act
    await settings.tapAction("subscription");

    // Assert
    await plan.expectReady();
  });
});
