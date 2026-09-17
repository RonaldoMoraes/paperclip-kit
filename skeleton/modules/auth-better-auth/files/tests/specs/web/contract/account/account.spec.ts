import { THROTTLED_EMAIL } from "../../../../../shared/contracts/auth/send-verification-otp.mock";
import { MOCK_OTP } from "../../../../../shared/contracts/auth/sign-in-email-otp.mock";
import { expect, test } from "../../../../fixtures/web";
import { expectScreenTag } from "../../../../helpers/store";
import { AccountPage } from "../../../../pages/web/account.page";
import { SettingsPage } from "../../../../pages/web/settings.page";
import { ShellPage } from "../../../../pages/web/shell.page";

test.describe("account", () => {
  test("a signed-out visitor to a guarded route is sent to sign-in with the way back", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);

    // Act — straight at a shelled destination
    await account.openGuardedSignedOut("/settings");

    // Assert — sign-in, no shell, and the trip remembered
    await account.expectSentHereFrom("/settings");
  });

  test("already signed in, sign-in is not a screen to sit on", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    const shell = new ShellPage(page);

    // Act
    await account.openSignedIn();

    // Assert — the root, which opens on the first destination
    await shell.expectScreen("example-list");
    await shell.expectShell();
  });

  test("already signed in with somewhere to be, the person is sent on to it", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    const settings = new SettingsPage(page);

    // Act — ?redirect= is what the gate attached when it turned the person away
    await account.openSignedIn("?redirect=%2Fsettings");

    // Assert
    await settings.expectReady();
  });

  test("submitting an email sends the code, moves to the code step, and holds the resend for the wait", async ({
    page,
  }) => {
    // Arrange
    const account = new AccountPage(page);
    await account.openSignedOut();
    await account.expectReady();

    // Act
    await account.submitEmail("e2e@example.com");

    // Assert — a code went out, so the next one waits
    await account.expectResendWaiting();
  });

  // The server's own refusal for coming too fast is answered by waiting, and the send
  // button under the field is what carries that wait when the code step never opened.
  test("a send the server refuses as too fast holds the email send shut for the wait", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    await account.openSignedOut();

    // Act — the one magic address that reproduces the rate limiter's 429
    await account.submitEmail(THROTTLED_EMAIL);

    // Assert
    await account.expectEmailSendWaiting();
  });

  // The field is `noValidate`, so the shared contract schema is what refuses a malformed
  // address — not the browser's own bubble, which no test and no mobile screen ever sees.
  test("an address that is not one is refused before anything is sent", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    await account.openSignedOut();

    // Act
    await account.submitEmail("e2e-at-example");

    // Assert
    await account.expectRefusedBeforeSending();
  });

  test("a wrong code shows its line and stays on the code step", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    await account.openSignedOut();
    await account.submitEmail("e2e@example.com");
    await account.expectOtpStep();

    // Act
    await account.fillOtp("99999");
    await account.submitOtp();

    // Assert
    await account.expectErrorVisible();
    await account.expectOtpStep();
  });

  test("verifying the code signs in and finishes the trip the gate interrupted", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    const settings = new SettingsPage(page);
    await account.openSignedOut("?redirect=%2Fsettings");
    await account.submitEmail("e2e@example.com");
    await account.fillOtp(MOCK_OTP);

    // Act — verifying flips the cookie; the gate on /settings reads the session it set
    await account.submitOtp();

    // Assert
    await settings.expectReady();
  });

  test("a provider signs the person in and lands them on the destination", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    const shell = new ShellPage(page);
    await account.openSignedOut();
    await account.expectReady();

    // Act — mock mode collapses the round-trip into its landing: the whole page leaves
    // for "/" with the cookie set, and the root opens on the first destination
    await account.tapProvider("google");

    // Assert
    await account.expectLandedOn("/example");
    await shell.expectScreen("example-list");
  });

  test("a failed provider round-trip lands with an error in the flow", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);

    // Act — Better Auth lands a failed round-trip on the error callback with ?error=
    await account.openSignedOut("?error=access_denied");

    // Assert
    await account.expectErrorVisible();
  });

  test("signing out from Settings lands on sign-in, and a reload stays signed out", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    const settings = new SettingsPage(page);
    await settings.openWithSeed(null);
    await settings.expectReady();
    await account.expectOwnSettingsRows();

    // Act
    await settings.tapAction("sign-out");

    // Assert — sign-in, then still sign-in after a fresh document: the marker lives in the jar
    await account.expectReady();
    await page.reload();
    await account.expectReady();
  });

  test("deleting the account, once confirmed, ends the session and lands on sign-in", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    const settings = new SettingsPage(page);
    page.once("dialog", (dialog) => dialog.accept());
    const deleted = page.waitForRequest(
      (request) => request.method() === "DELETE" && new URL(request.url()).pathname === "/api/account"
    );
    await settings.openWithSeed(null);
    await settings.expectReady();

    // Act
    await settings.tapAction("delete-account");

    // Assert — the one write, then sign-in
    await deleted;
    await account.expectReady();
    await expect(page).toHaveURL(/\/account/);
  });

  // The critical path keeps one keyboard-only variant.
  test("keyboard only: Tab reaches the email and code fields, Enter submits both", async ({ page }) => {
    // Arrange
    const account = new AccountPage(page);
    await account.openSignedOut("?redirect=%2Fsettings");
    await account.expectReady();

    // Act — the email, from the keyboard alone
    await account.tabToKey("account_email_input");
    await account.typeAndEnter("e2e-kbd@example.com");
    await account.expectOtpStep();

    // Act — the code, same way
    await account.tabToKey("account_otp_input");
    await account.typeAndEnter(MOCK_OTP);

    // Assert
    await expectScreenTag(page, "settings");
  });
});
