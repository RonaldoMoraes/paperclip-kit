import { MOCK_OTP } from "../../../../shared/contracts/auth/sign-in-email-otp.mock";
import { test } from "../../../fixtures/web";
import { AccountPage } from "../../../pages/web/account.page";
import { ExamplePage } from "../../../pages/web/example.page";

/**
 * Smoke: the front door. Signed out, one email, one code, the list. Short, real-usage
 * surface — not the whole journey.
 */
test.describe("Sign-in @smoke @web", () => {
  test("an email and a code open the app", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    const example = new ExamplePage(page);

    // Act — the root is guarded, so a signed-out visitor meets sign-in first
    await account.openGuardedSignedOut("/");
    await account.expectReady();
    await account.submitEmail("smoke@example.com");
    await account.fillOtp(MOCK_OTP);
    await account.submitOtp();

    // Assert
    await example.expectList();
  });
});
