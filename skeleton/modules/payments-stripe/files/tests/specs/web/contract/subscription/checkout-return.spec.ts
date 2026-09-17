import { expect, test } from "../../../../fixtures/web";
import { CheckoutReturnPage } from "../../../../pages/web/checkout-return.page";
import { PaywallPage } from "../../../../pages/web/paywall.page";

test.describe("checkout return", () => {
  test("a session id settles the checkout in one call, with no webhook to wait on", async ({ page }) => {
    // Arrange
    const checkout = new CheckoutReturnPage(page);

    // Act — the way Stripe's success URL arrives
    await checkout.openFromCheckout();

    // Assert
    await checkout.expectConfirmed();
    await checkout.expectNote();
  });

  test("settling is idempotent — a reload of the return changes nothing", async ({ page }) => {
    // Arrange
    const checkout = new CheckoutReturnPage(page);
    await checkout.openFromCheckout();
    await checkout.expectConfirmed();

    // Act — a fresh document, the same session id
    await page.reload();

    // Assert — still the plan that was bought, not a second one
    await checkout.expectConfirmed();
  });

  test("a trial is a settled outcome, not a failed checkout", async ({ page }) => {
    // Arrange
    const checkout = new CheckoutReturnPage(page);

    // Act — `trialing`, which the plugin's own success route would have called a failure
    await checkout.openHolding("trialing");

    // Assert
    await checkout.expectConfirmed();
    await checkout.expectNote();
  });

  test("arriving with no checkout to settle says so, and offers the way back", async ({ page }) => {
    // Arrange
    const checkout = new CheckoutReturnPage(page);
    const paywall = new PaywallPage(page);

    // Act — a bookmark or a back button: no session id, and nothing on the session either
    await checkout.openBare();

    // Assert
    await checkout.expectUnconfirmed();

    // Act — and the way out of it
    await checkout.retry();

    // Assert
    await paywall.expectReady();
    await expect(page).toHaveURL(/\/paywall/);
  });
});
